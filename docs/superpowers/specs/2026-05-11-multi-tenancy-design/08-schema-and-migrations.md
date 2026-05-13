# 08 — Schema and Migrations

Drizzle ORM target: **0.45.x stable** (May 2026). Drizzle 1.0.0-rc.1 is current but not stable; an optional Phase D migration to `defineRelations` v2 is queued in [11-gotchas.md](./11-gotchas.md). Sources: https://orm.drizzle.team/docs/latest-releases · https://orm.drizzle.team/docs/upgrade-v1

## Migration order (Phase A)

| # | Migration | Files | Notes |
|---|---|---|---|
| A1.1 | `tenant_custom_hostnames` table | `packages/db/migrations/000X_tenant_custom_hostnames.sql` | 6-state lifecycle CHECK. Tenant scoping via service-layer `organizationId` gating (no RLS). |
| A1.2 | `sso_providers` table | `000X_sso_providers.sql` | BA SSO plugin shape; bytea encryption columns. Tenant scoping via repository (no RLS). |
| A1.3 | `reserved_slugs` table | `000X_reserved_slugs.sql` | Tombstones + per-deploy denylist. |
| A1.4 | `global_admins` table | `000X_global_admins.sql` | Separate from `user`. Operator-only. |
| A1.5 | `organization` columns | `000X_organization_columns.sql` | + `enforce_sso`, `suspended_at`, `session_version`, `branding`, `deleted_at`. |
| A1.6 | `audit_logs` reshape | `000X_audit_logs_reshape.sql` | + `organization_id`, polymorphic `actor_id`/`actor_type`; drop FK; append-only trigger. |
| A1.7 | `audit_logs_no_mutation` trigger | `000X_audit_logs_trigger.sql` | `BEFORE UPDATE OR DELETE` raises. |
| A1.8 | `pgcrypto` extension | `000X_pgcrypto.sql` | `CREATE EXTENSION IF NOT EXISTS pgcrypto`. |
| A1.9 | `sso_providers_decrypted` view | `000X_sso_providers_view.sql` | Read-side helper for OIDC envelope decryption inside `SET LOCAL app.dek`. |
| A1.10 | `tenant_cache_version` table | `000X_tenant_cache_version.sql` | Single-row counter for cold-start version recovery. |
| A1.11 | Drizzle introspect parity | (no SQL) | `drizzle-kit introspect` parity check task. |

## Tables (schema delta)

### `tenant_custom_hostnames`

```sql
CREATE TABLE tenant_custom_hostnames (
  id varchar(255) PRIMARY KEY,                              -- cuid tnh_*
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  lifecycle_status text NOT NULL DEFAULT 'pending_txt'
    CHECK (lifecycle_status IN ('pending_txt','awaiting_caddy','active','failed','removing','removed')),
  caddy_cert_storage_key text,
  verification_token text NOT NULL,
  verification_verified_at timestamptz,
  verification_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_reconciled_at timestamptz,
  last_handshake_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tch_organization_id_idx ON tenant_custom_hostnames(organization_id);
CREATE INDEX tch_status_reconciled_idx ON tenant_custom_hostnames(lifecycle_status, last_reconciled_at);
```

Tenant scoping is enforced at the service layer (see `customHostnameLifecycle` in [04-custom-hostnames.md](./04-custom-hostnames.md) and `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo for the canonical scoping pattern): every read or write of this table carries `eq(tenantCustomHostnames.organizationId, organizationId)` in its WHERE clause. The single exception is the constant-time `/caddy/ask` lookup, which projects only `lifecycle_status` for a given `hostname` and exposes no tenant data.

### `sso_providers`

```sql
CREATE TABLE sso_providers (
  id varchar(255) PRIMARY KEY,                              -- cuid ssop_*
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  issuer text NOT NULL,
  domain text NOT NULL,
  oidc_config_encrypted bytea NOT NULL,                     -- pgp_sym_encrypt(jsonb_text, dek)
  oidc_config_edek bytea NOT NULL,                          -- KMS-wrapped DEK
  kek_version integer NOT NULL,
  domain_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_id)
);
```

Tenant scoping is enforced inside `ssoProviderRepository` (D56; canonical example in `apps/server/src/modules/org-admin/sso/repository.ts` of the worker repo). Every method that reads or mutates a single provider takes `organizationId` and gates the WHERE clause on `eq(ssoProviders.organizationId, organizationId)` alongside the row id, preventing cross-tenant secret access.

Envelope-encryption helpers:
```ts
// packages/db/src/envelope-encrypt.ts
import { sql } from "drizzle-orm";

export const encryptedOidcConfigSql = (jsonBlob: string, dek: Buffer) =>
  sql`pgp_sym_encrypt(${jsonBlob}, ${dek.toString('hex')}, 'cipher-algo=aes256, compress-algo=1')`;

export const decryptedOidcConfigSql = (column: any, dek: Buffer) =>
  sql`pgp_sym_decrypt(${column}, ${dek.toString('hex')})::text`;
```

The `sso_providers_decrypted` SECURITY DEFINER view (fallback for read-only flows that already hold the DEK via session-var):
```sql
CREATE OR REPLACE VIEW sso_providers_decrypted
WITH (security_barrier=true, security_invoker=false) AS
SELECT id, organization_id, provider_id, issuer, domain,
       pgp_sym_decrypt(oidc_config_encrypted, current_setting('app.dek', true))::text AS oidc_config,
       kek_version, domain_verified_at, created_at, updated_at
  FROM sso_providers;
REVOKE ALL ON sso_providers_decrypted FROM PUBLIC;
```

The view is read only inside `withDecryptedSecret(...)` — a transaction that issues `SET LOCAL app.dek = <key>` before selecting from the view, then scopes the row by both `organizationId` and `providerRowId`. The plaintext never escapes the closure.

Sources: https://www.postgresql.org/docs/current/pgcrypto.html

### `reserved_slugs`

```sql
CREATE TABLE reserved_slugs (
  slug text PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('tombstone','platform','operator_denylist')),
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Global reserved list — not tenant-scoped; read by parseHostname / slug guard.
```

### `global_admins`

(Full definition in [05-admin-panel.md](./05-admin-panel.md).)

### `organization` columns added

```sql
ALTER TABLE organizations
  ADD COLUMN enforce_sso boolean NOT NULL DEFAULT false,
  ADD COLUMN suspended_at timestamptz,
  ADD COLUMN session_version integer NOT NULL DEFAULT 0,
  ADD COLUMN branding jsonb NOT NULL DEFAULT '{"logoVersion":0,"primaryColor":"#2563eb","appName":"App"}'::jsonb,
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX organizations_slug_live_idx
  ON organizations(slug)
  WHERE deleted_at IS NULL;
```

### `audit_logs` reshape

```sql
ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey,
  ALTER COLUMN actor_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS organization_id text,
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'USER'
    CHECK (actor_type IN ('USER','GLOBAL_ADMIN','SYSTEM'));

-- Append-only enforcement
CREATE OR REPLACE FUNCTION audit_logs_no_mutation_fn() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_mutation_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_no_mutation_fn();
```

### `tenant_cache_version`

```sql
CREATE TABLE tenant_cache_version (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),          -- single row
  version text NOT NULL DEFAULT '0'
);
INSERT INTO tenant_cache_version (id, version) VALUES (1, '0') ON CONFLICT DO NOTHING;
```

Single-row counter recovered on cold start. Each invalidation runs the version bump inside the same transaction as its functional write; the Hatchet `tenancy.invalidate` event is published AFTER commit:
```sql
-- inside the same transaction as the functional write:
UPDATE tenant_cache_version SET version = (extract(epoch from now())::bigint)::text WHERE id = 1;
-- then, in application code, after the transaction commits:
-- await hatchet.events.push("tenancy.invalidate", { host: "<canonical>" });
```

## Application-Layer Tenant Scoping

Tenant isolation is enforced in TypeScript, not Postgres. There is one DB user (non-superuser, no `BYPASSRLS`), no `app.current_tenant` session variable, and no `CREATE POLICY` blocks on tenant-scoped tables. The pattern has three load-bearing pieces; the reference implementation lives in the sibling worker repo (`/home/kuldeep/code/personal/worker-template-2026`) and is ported verbatim.

### 1. Sanctioned read seam for `organizations`

`packages/db/src/live-organizations.ts` exports `liveOrganizations(executor)`, the only supported way for code outside `@repo/db` to read the `organizations` table. Every shape pre-binds `WHERE deleted_at IS NULL` so callers cannot accidentally surface tombstoned tenants.

```ts
// packages/db/src/live-organizations.ts (signature; full implementation ports
// from worker-template-2026/packages/db/src/live-organizations.ts)
export function liveOrganizations(executor: Executor): {
  select<TColumns extends SelectColumns>(
    columns: TColumns,
    extraWhere?: SQL
  ): Promise<RowOf<TColumns>[]>;
  selectById<TColumns extends SelectColumns>(
    columns: TColumns,
    organizationId: string
  ): Promise<RowOf<TColumns>[]>;
  selectBySlug<TColumns extends SelectColumns>(
    columns: TColumns,
    slug: string
  ): Promise<RowOf<TColumns>[]>;
  findFirst(
    args: NonNullable<
      Parameters<Executor["query"]["organizations"]["findFirst"]>[0]
    >
  ): ReturnType<Executor["query"]["organizations"]["findFirst"]>;
};
export type LiveOrganizations = ReturnType<typeof liveOrganizations>;
```

### 2. Structural ALLOWLIST CI test

`packages/db/__tests__/live-organizations.spec.ts` walks `apps/` + `packages/`, greps every `.ts` / `.tsx` file for `from(organizations)` and `query.organizations.findFirst|findMany`, and fails CI on any callsite not in `ALLOWLIST`. The allowlist is short (suspension/restore service that manages `deleted_at` directly, the custom-host join in `@repo/tenancy`, the dev seed, the seam itself, and the auth-tokens verifier that structurally types the DB shape). Adding a new entry requires a documented justification in both the spec file and the offending source file.

### 3. Service / repository-layer tenant scoping for every other tenant-scoped table

For `sso_providers`, `tenant_custom_hostnames`, `audit_logs`, `roles`, `member`, `invitation`, `notifications`, `notification_preferences`, `push_tokens`, and any future tenant-scoped table, the owning repository takes `organizationId` and bakes `eq(<table>.organizationId, organizationId)` into every WHERE clause. Canonical port reference: `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo. Each module owns a service-layer isolation test (run inside testcontainers `postgres:18-alpine`) asserting that a query with `organizationId=A` cannot return rows where `organizationId=B`. See [12-testing-and-local-dev.md](./12-testing-and-local-dev.md).

The Hono context variable `c.var.tenant` (set by `tenantMiddleware`) carries the resolved tenant; handlers and services read `tenant.organizationId` and pass it down. There is no Postgres session-variable plumbing.

### Caddy `ask` path

`/caddy/ask` is a constant-time `SELECT lifecycle_status FROM tenant_custom_hostnames WHERE hostname = $1 LIMIT 1` on the same single DB user. The projection exposes no tenant identifiers, the handler binds on the internal Docker network only, and per-source-IP rate limits are set on it (see [04-custom-hostnames.md](./04-custom-hostnames.md)).

## Drizzle schema files (representative)

`packages/db/src/schema/tenant-custom-hostnames.ts`:
```ts
import { pgTable, text, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { createdAt, updatedAt } from "./columns";
import { organizations } from "./organizations";

export const customHostnameLifecycle = [
  "pending_txt","awaiting_caddy","active","failed","removing","removed",
] as const;
export type CustomHostnameLifecycle = typeof customHostnameLifecycle[number];

export const tenantCustomHostnames = pgTable("tenant_custom_hostnames", {
  id: varchar("id", { length: 255 }).primaryKey()
       .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.tenantHostname)),
  organizationId: text("organization_id").notNull()
       .references(() => organizations.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  lifecycleStatus: text("lifecycle_status", { enum: customHostnameLifecycle })
       .notNull().default("pending_txt"),
  caddyCertStorageKey: text("caddy_cert_storage_key"),
  verificationToken: text("verification_token").notNull(),
  verificationVerifiedAt: timestamp("verification_verified_at", { withTimezone: true }),
  verificationErrors: jsonb("verification_errors").$type<string[]>().notNull().default([]),
  lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
  lastHandshakeAt: timestamp("last_handshake_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("tch_organization_id_idx").on(t.organizationId),
  index("tch_status_reconciled_idx").on(t.lifecycleStatus, t.lastReconciledAt),
]);
```

`ID_PREFIXES` additions in `packages/db/src/ids.ts`:
```ts
tenantHostname: "tnh",
verificationToken: "vtok",
globalAdmin: "ga",
ssoProvider: "ssop",
```

## Phase B / Phase C add no new schema

Per worker plan parity. Phase B is UI + admin process + branding storage (no DDL). Phase C is service-extraction refactor (no DDL).

## Drizzle caveats (2026)

- `relations()` builder is current on 0.45.x. Phase D queued migration to `defineRelations` v2 once 1.0 stable lands.
- `bytea()` is built-in in 0.45.x.
- For pgcrypto wraps, raw `sql\`pgp_sym_encrypt(${value}, ${key}, 'cipher-algo=aes256')\`` at call sites is the idiomatic 2026 pattern; `customType` is supported but `toDriver` can't return SQL fragments.
- `drizzle-kit generate` is still the canonical migration command.

Source: https://orm.drizzle.team/docs/custom-types

## `column_encrypt` evaluation (deferred)

Postgres extension `column_encrypt` v4.0 (April 2026) offers transparent `encrypted_text`/`encrypted_bytea` types with wrapped keys, session-only key loading, blind indexes, key rotation. Considered for the OIDC secret column; **deferred to a Phase D evaluation** because:
- Newer, smaller community (April 2026).
- We get the same effective security with application-side envelope encryption that we already need (vault abstraction) — moving to `column_encrypt` would mean two encryption paths.

Source: https://vibhorkumar.wordpress.com/2026/04/12/column_encrypt-v4-0-a-simpler-safer-model-for-column-level-encryption-in-postgresql/
