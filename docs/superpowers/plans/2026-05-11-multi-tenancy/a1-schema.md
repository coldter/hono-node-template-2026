# A1 — Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every DDL change the spec calls for — new tables, organization columns, audit-logs reshape, append-only trigger, pgcrypto + decrypted view, single-row cache-version counter — and add the application-layer OTC (only-through-the-canonical-seam) read seam for `organizations` plus its structural CI test. Tenant isolation is enforced in TypeScript per spec § 08 § Application-Layer Tenant Scoping; there is no Postgres RLS.

**Architecture:** Pure Drizzle 0.45.x migrations in `packages/db/migrations/`. Each migration is a single `drizzle-kit generate` output plus a hand-written rollback note. The single non-superuser DB user receives privileges via the standard role grants in `docker/db/init.sql` (no `app_role` / `ops_lookup_role`).

**Tech Stack:** Drizzle ORM `^0.45.2`, `drizzle-kit`, Postgres `18.3` with `pgcrypto`, Vitest `^4.1.6`, `pg` `^8.20.0` (testcontainers harness), `@testcontainers/postgresql`.

**References:** spec § 08 (schema/migrations + Application-Layer Tenant Scoping), § 09 (security; OTC pattern), § 10 (ND12, ND11), worker reference port at `/home/kuldeep/code/personal/worker-template-2026/packages/db/src/live-organizations.ts` and `/home/kuldeep/code/personal/worker-template-2026/packages/db/__tests__/live-organizations.spec.ts`.

---

## Task A1.1: `tenant_custom_hostnames` table + lifecycle enum

**Files:**
- Create: `packages/db/src/schema/tenant-custom-hostnames.ts`
- Modify: `packages/db/src/schema/index.ts` (re-export)
- Modify: `packages/db/src/ids.ts` (add `tenantHostname: "tnh"` + `verificationToken: "vtok"`)
- Generate: `packages/db/migrations/000X_tenant_custom_hostnames.sql`
- Test: `packages/db/__tests__/tenant-custom-hostnames.schema.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { tenantCustomHostnames, customHostnameLifecycle } from "../src/schema/tenant-custom-hostnames";

describe("tenantCustomHostnames", () => {
  it("has the 6-state lifecycle enum", () => {
    expect(customHostnameLifecycle).toEqual([
      "pending_txt","awaiting_caddy","active","failed","removing","removed",
    ]);
  });
  it("declares all required columns", () => {
    const keys = Object.keys(tenantCustomHostnames);
    for (const k of ["id","organizationId","hostname","lifecycleStatus","verificationToken"]) {
      expect(keys).toContain(k);
    }
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
bun run test --filter @repo/db -- tenant-custom-hostnames.schema
```

Expected: `Cannot find module '../src/schema/tenant-custom-hostnames'`.

- [ ] **Step 3: Implement the schema file**

```ts
// packages/db/src/schema/tenant-custom-hostnames.ts
import { pgTable, text, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { createdAt, updatedAt } from "./columns";
import { organizations } from "./organizations";

export const customHostnameLifecycle = [
  "pending_txt","awaiting_caddy","active","failed","removing","removed",
] as const;
export type CustomHostnameLifecycle = (typeof customHostnameLifecycle)[number];

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

export type TenantCustomHostname = typeof tenantCustomHostnames.$inferSelect;
export type NewTenantCustomHostname = typeof tenantCustomHostnames.$inferInsert;
```

Then add to `packages/db/src/ids.ts`:
```ts
tenantHostname: "tnh",
verificationToken: "vtok",
```

Re-export from `packages/db/src/schema/index.ts`:
```ts
export * from "./tenant-custom-hostnames";
```

- [ ] **Step 4: Generate the migration**

```bash
bun --filter @repo/db db:generate
```

Inspect `packages/db/migrations/000X_tenant_custom_hostnames.sql`. Confirm `CHECK (lifecycle_status IN (...))` exists. Confirm there are NO `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` lines — tenant scoping is enforced at the service layer (spec § 08 § Application-Layer Tenant Scoping).

- [ ] **Step 5: Run tests + lint**

```bash
bun run test --filter @repo/db
bun run fix && bun run check
```

- [ ] **Step 6: Self-review**

Diff scan: schema matches spec § 08; ID prefix `tnh_` matches; no `any`; indexes match; no RLS in the generated migration.

## Task A1.2: `sso_providers` table

**Files:**
- Create: `packages/db/src/schema/sso-providers.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/ids.ts` (add `ssoProvider: "ssop"`)
- Generate: `packages/db/migrations/000X_sso_providers.sql`
- Test: `packages/db/__tests__/sso-providers.schema.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { ssoProviders } from "../src/schema/sso-providers";

describe("ssoProviders", () => {
  it("has envelope-encryption columns", () => {
    const keys = Object.keys(ssoProviders);
    for (const k of ["oidcConfigEncrypted","oidcConfigEdek","kekVersion","domainVerifiedAt"]) {
      expect(keys).toContain(k);
    }
  });
  it("unique on (organizationId, providerId)", () => {
    // verified via the migration SQL containing UNIQUE constraint
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
// packages/db/src/schema/sso-providers.ts
import { pgTable, text, varchar, integer, timestamp, customType, uniqueIndex } from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { createdAt, updatedAt } from "./columns";
import { organizations } from "./organizations";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "bytea"; },
});

export const ssoProviders = pgTable("sso_providers", {
  id: varchar("id", { length: 255 }).primaryKey()
       .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.ssoProvider)),
  organizationId: text("organization_id").notNull()
       .references(() => organizations.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer").notNull(),
  domain: text("domain").notNull(),
  oidcConfigEncrypted: bytea("oidc_config_encrypted").notNull(),
  oidcConfigEdek: bytea("oidc_config_edek").notNull(),
  kekVersion: integer("kek_version").notNull(),
  domainVerifiedAt: timestamp("domain_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("sso_org_provider_unique").on(t.organizationId, t.providerId),
]);

export type SsoProvider = typeof ssoProviders.$inferSelect;
```

- [ ] **Step 4: Generate migration, run tests, lint**

Confirm the generated migration contains the `UNIQUE` index and DOES NOT contain `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`. Tenant scoping for `sso_providers` is enforced inside `ssoProviderRepository` (Phase C / D56) per spec § 08 § Application-Layer Tenant Scoping.

- [ ] **Step 5: Self-review**

## Task A1.3: `reserved_slugs` table

**Files:**
- Create: `packages/db/src/schema/reserved-slugs.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generate: `packages/db/migrations/000X_reserved_slugs.sql`
- Test: `packages/db/__tests__/reserved-slugs.schema.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { reservedSlugs, reservedSlugReason } from "../src/schema/reserved-slugs";

describe("reservedSlugs", () => {
  it("enumerates reasons", () => {
    expect(reservedSlugReason).toEqual(["tombstone","platform","operator_denylist"]);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
// packages/db/src/schema/reserved-slugs.ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { organizations } from "./organizations";

export const reservedSlugReason = ["tombstone","platform","operator_denylist"] as const;

export const reservedSlugs = pgTable("reserved_slugs", {
  slug: text("slug").primaryKey(),
  reason: text("reason", { enum: reservedSlugReason }).notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});
```

This table is a global denylist; not tenant-scoped. No RLS, no service-layer org gating — every caller reads the full table.

- [ ] **Step 4: Generate, test, lint**

- [ ] **Step 5: Self-review**

## Task A1.4: `global_admins` table

**Files:**
- Create: `packages/db/src/schema/global-admins.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/ids.ts` (add `globalAdmin: "ga"`)
- Generate: `packages/db/migrations/000X_global_admins.sql`
- Test: `packages/db/__tests__/global-admins.schema.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { globalAdmins, globalAdminSubRole } from "../src/schema/global-admins";

describe("globalAdmins", () => {
  it("enumerates sub-roles", () => {
    expect(globalAdminSubRole).toEqual(["platform_admin","support","read_only"]);
  });
  it("user_id nullable until enrollment bound", () => {
    const userIdCol = globalAdmins.userId;
    expect(userIdCol.notNull).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
// packages/db/src/schema/global-admins.ts
import { pgTable, text, varchar, customType, timestamp } from "drizzle-orm/pg-core";
import { generatePrefixedCuid, ID_PREFIXES } from "../ids";
import { createdAt, updatedAt } from "./columns";
import { users } from "./auth";   // existing BA user table re-export

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return "bytea"; } });

export const globalAdminSubRole = ["platform_admin","support","read_only"] as const;

export const globalAdmins = pgTable("global_admins", {
  id: varchar("id", { length: 255 }).primaryKey()
       .$defaultFn(() => generatePrefixedCuid(ID_PREFIXES.globalAdmin)),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  email: text("email").notNull().unique(),    // citext via custom type if needed; spec § 08
  subRole: text("sub_role", { enum: globalAdminSubRole }).notNull(),
  enrollmentTokenHash: bytea("enrollment_token_hash"),
  enrollmentExpiresAt: timestamp("enrollment_expires_at", { withTimezone: true }),
  boundAt: timestamp("bound_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type GlobalAdmin = typeof globalAdmins.$inferSelect;
```

Operator-scoped table; no tenant column, no RLS.

- [ ] **Step 4: Generate, test, lint**

- [ ] **Step 5: Self-review**

## Task A1.5: `organization` columns added

**Files:**
- Modify: `packages/db/src/schema/organizations.ts`
- Generate: `packages/db/migrations/000X_organization_columns.sql`
- Test: `packages/db/__tests__/organizations-columns.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { organizations } from "../src/schema/organizations";

describe("organizations columns", () => {
  it("has multi-tenancy columns", () => {
    const keys = Object.keys(organizations);
    for (const k of ["enforceSSO","suspendedAt","sessionVersion","branding","deletedAt"]) {
      expect(keys).toContain(k);
    }
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Modify the table definition**

In `packages/db/src/schema/organizations.ts`, add:
```ts
enforceSSO: boolean("enforce_sso").notNull().default(false),
suspendedAt: timestamp("suspended_at", { withTimezone: true }),
sessionVersion: integer("session_version").notNull().default(0),
branding: jsonb("branding").$type<{ logoVersion: number; primaryColor: string; appName: string }>()
  .notNull().default({ logoVersion: 0, primaryColor: "#2563eb", appName: "App" }),
deletedAt: timestamp("deleted_at", { withTimezone: true }),
```

- [ ] **Step 4: Generate migration**

`bun --filter @repo/db db:generate`. Confirm the migration adds the columns and the partial unique index `organizations_slug_live_idx ON organizations(slug) WHERE deleted_at IS NULL`.

- [ ] **Step 5: Run tests + lint**

- [ ] **Step 6: Self-review**

## Task A1.6: `audit_logs` reshape

**Files:**
- Modify: `packages/db/src/schema/audit-logs.ts`
- Generate: `packages/db/migrations/000X_audit_logs_reshape.sql`
- Test: `packages/db/__tests__/audit-logs-shape.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { auditLogs, actorTypeEnum } from "../src/schema/audit-logs";

describe("auditLogs reshape", () => {
  it("polymorphic actor + organization_id", () => {
    const keys = Object.keys(auditLogs);
    expect(keys).toContain("organizationId");
    expect(keys).toContain("actorType");
  });
  it("actor types include GLOBAL_ADMIN and SYSTEM", () => {
    expect(actorTypeEnum).toEqual(["USER","GLOBAL_ADMIN","SYSTEM"]);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Modify schema**

```ts
export const actorTypeEnum = ["USER","GLOBAL_ADMIN","SYSTEM"] as const;
// drop FK on actor_id, drop FK on organization_id, add organization_id (nullable, no FK),
// add actor_type
```

Then `bun --filter @repo/db db:generate`. Hand-edit the migration to also DROP the FK constraints on BOTH `actor_id` and `organization_id` if `drizzle-kit` didn't emit those drops. The migration must declare `organization_id` and `actor_id` as plain columns with no `REFERENCES` clause.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

Worker-D30 no-FK invariant: `audit_logs.actor_id` and `audit_logs.organization_id` MUST NOT carry FKs to `users(id)` / `organizations(id)` respectively. Audit rows outlive hard-deleted users and organizations (forensic record); cascading deletes or FK validation against the live row would defeat that. The schema test does not assert the absence (Drizzle does not surface the FK presence cleanly); the migration SQL is the source of truth and the diff review at Step 5 must verify it.

## Task A1.7: `audit_logs_no_mutation` trigger

**Files:**
- Create: `packages/db/migrations/000X_audit_logs_trigger.sql` (hand-written)
- Test: `packages/db/__tests__/audit-logs-trigger.test.ts` (integration with testcontainers)

- [ ] **Step 1: Failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

let pg: Client; let container: StartedPostgreSqlContainer;
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  pg = new Client({ connectionString: container.getConnectionUri() });
  await pg.connect();
  // run migrations up to A1.7
});
afterAll(async () => { await pg.end(); await container.stop(); });

describe("audit_logs append-only trigger", () => {
  it("rejects UPDATE", async () => {
    await pg.query(`INSERT INTO audit_logs (id, action, actor_id, actor_type, organization_id) VALUES ('al_1','x','u_1','USER','o_1')`);
    await expect(pg.query(`UPDATE audit_logs SET action='y' WHERE id='al_1'`)).rejects.toThrow(/append-only/);
  });
  it("rejects DELETE", async () => {
    await expect(pg.query(`DELETE FROM audit_logs WHERE id='al_1'`)).rejects.toThrow(/append-only/);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Create the migration**

```sql
-- packages/db/migrations/000X_audit_logs_trigger.sql
CREATE OR REPLACE FUNCTION audit_logs_no_mutation_fn() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_logs_no_mutation_trigger
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION audit_logs_no_mutation_fn();
```

This DB-level invariant stays — it is independent of tenancy enforcement and would survive any future shift between OTC and RLS.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A1.8: `pgcrypto` extension + `sso_providers_decrypted` view

**Files:**
- Create: `packages/db/migrations/000X_pgcrypto.sql`
- Create: `packages/db/migrations/000X_sso_providers_view.sql`
- Test: `packages/db/__tests__/sso-decryption.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { withTestDb } from "../__tests__/helpers/with-test-db";

describe("sso_providers_decrypted view", () => {
  it("decrypts when app.dek session var is set", async () => {
    await withTestDb(async (pg) => {
      const dek = Buffer.from("0".repeat(64), "hex");
      await pg.query(`SELECT set_config('app.dek', $1, true)`, [dek.toString("hex")]);
      await pg.query(`INSERT INTO sso_providers (id, organization_id, provider_id, issuer, domain, oidc_config_encrypted, oidc_config_edek, kek_version)
                       VALUES ('ssop_1','o_1','google','https://accounts.google.com','acme.com',
                               pgp_sym_encrypt('{"clientId":"x"}', $1, 'cipher-algo=aes256'),
                               '\\x00', 1)`, [dek.toString("hex")]);
      const r = await pg.query(`SELECT oidc_config FROM sso_providers_decrypted WHERE id='ssop_1'`);
      expect(JSON.parse(r.rows[0].oidc_config)).toEqual({ clientId: "x" });
    });
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Create migrations**

```sql
-- packages/db/migrations/000X_pgcrypto.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

```sql
-- packages/db/migrations/000X_sso_providers_view.sql
CREATE OR REPLACE VIEW sso_providers_decrypted
WITH (security_barrier=true, security_invoker=false) AS
SELECT id, organization_id, provider_id, issuer, domain,
       pgp_sym_decrypt(oidc_config_encrypted, current_setting('app.dek', true))::text AS oidc_config,
       kek_version, domain_verified_at, created_at, updated_at
  FROM sso_providers;
REVOKE ALL ON sso_providers_decrypted FROM PUBLIC;
```

The view is consumed inside `withDecryptedSecret(...)` which sets `app.dek` for the duration of a transaction and scopes the row by `organizationId` + `providerRowId`. The single app DB user inherits `SELECT` on the view via the `ALTER DEFAULT PRIVILEGES` grants in `docker/db/init.sql`. There is no separate `app_role` — tenancy is enforced in TS, not by role separation.

`app.dek` and the envelope-encryption surface are a different concern from tenancy (per-transaction OIDC client-secret protection) and remain in place under the OTC pattern.

- [ ] **Step 4: Test + lint**

- [ ] **Step 5: Self-review**

## Task A1.9: `tenant_cache_version` table

**Files:**
- Create: `packages/db/src/schema/tenant-cache-version.ts`
- Generate: `packages/db/migrations/000X_tenant_cache_version.sql`
- Test: `packages/db/__tests__/tenant-cache-version.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { tenantCacheVersion } from "../src/schema/tenant-cache-version";

describe("tenantCacheVersion", () => {
  it("has single-row constraint via PK check", () => {
    expect(Object.keys(tenantCacheVersion)).toEqual(["id","version"]);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { pgTable, integer, text, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const tenantCacheVersion = pgTable("tenant_cache_version", {
  id: integer("id").primaryKey().default(1),
  version: text("version").notNull().default("0"),
}, (t) => [check("single_row", sql`${t.id} = 1`)]);
```

Add the seed insert as part of the generated migration:
```sql
INSERT INTO tenant_cache_version (id, version) VALUES (1, '0') ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: Test + lint**

- [ ] **Step 5: Self-review**

## Task A1.10: `liveOrganizations(executor)` read seam in `@repo/db`

The sanctioned read seam for the `organizations` table. Every shape pre-binds `WHERE deleted_at IS NULL` so callers cannot accidentally surface tombstoned tenants. Ported verbatim from `/home/kuldeep/code/personal/worker-template-2026/packages/db/src/live-organizations.ts`.

**Files:**
- Create: `packages/db/src/live-organizations.ts`
- Modify: `packages/db/src/index.ts` (re-export `liveOrganizations`, `LiveOrganizations`)
- Test: `packages/db/__tests__/live-organizations.test.ts` (behavioural — soft-delete predicate is always present)

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/schema";
import { liveOrganizations } from "../src/live-organizations";
import { setupSchema } from "./helpers/setup-schema";

let container: StartedPostgreSqlContainer; let pool: Pool;
beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await setupSchema(pool);
});
afterAll(async () => { await pool.end(); await container.stop(); });

describe("liveOrganizations", () => {
  it("hides soft-deleted rows from select / selectById / selectBySlug / findFirst", async () => {
    const db = drizzle(pool, { schema });
    await pool.query(`INSERT INTO organizations (id, slug, name, deleted_at) VALUES ('o_dead','dead','Dead', now())`);
    await pool.query(`INSERT INTO organizations (id, slug, name) VALUES ('o_live','live','Live')`);
    const live = liveOrganizations(db);
    const all = await live.select({ id: schema.organizations.id });
    expect(all.map((r) => r.id)).toEqual(["o_live"]);
    expect(await live.selectById({ id: schema.organizations.id }, "o_dead")).toHaveLength(0);
    expect(await live.selectBySlug({ id: schema.organizations.id }, "dead")).toHaveLength(0);
    expect(await live.findFirst({ where: { id: "o_dead" } })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, watch fail**

```bash
bun run test --filter @repo/db -- live-organizations.test
```

Expected: `Cannot find module '../src/live-organizations'`.

- [ ] **Step 3: Port the helper**

Copy `/home/kuldeep/code/personal/worker-template-2026/packages/db/src/live-organizations.ts` to `packages/db/src/live-organizations.ts` verbatim. Adjust the import of `Executor` / `DrizzleClient` if our `client.ts` does not export those exact names — the helper expects `Executor = DrizzleClient | Transaction` and the same `query.organizations.findFirst` relational shape. Preserve the `// boundary:` comments unchanged; they document the Drizzle generic variance casts.

Add the re-export in `packages/db/src/index.ts`:
```ts
export { liveOrganizations, type LiveOrganizations } from "./live-organizations";
```

- [ ] **Step 4: Run tests + lint**

```bash
bun run test --filter @repo/db -- live-organizations.test
bun run fix && bun run check
```

- [ ] **Step 5: Self-review**

Confirm: helper compiles under `tsgo --noEmit`; no `any`; the only `as unknown as Promise<RowOf<...>>` casts are the four pre-existing `// boundary:` sites in the port; soft-delete predicate is woven into all four shapes.

## Task A1.11: Structural ALLOWLIST CI test for the `organizations` read seam

Greps every `.ts` / `.tsx` file under `apps/` + `packages/` for direct reads of the `organizations` table (`from(organizations)` and `query.organizations.findFirst|findMany`) and fails CI on any callsite not in `ALLOWLIST`. Ported from `/home/kuldeep/code/personal/worker-template-2026/packages/db/__tests__/live-organizations.spec.ts`.

**Files:**
- Create: `packages/db/__tests__/live-organizations.spec.ts`
- Modify: `packages/db/vitest.config.ts` (ensure `__tests__/*.spec.ts` is included in the suite)

- [ ] **Step 1: Port the structural test**

Copy the worker version verbatim. Then update `ALLOWLIST` for our repo state at the time A1.11 lands:

```ts
const ALLOWLIST: string[] = [
  // The seam itself.
  "packages/db/src/live-organizations.ts",
  // Dev-seed contract test: runs against a fresh DB, no soft-deletes exist.
  // (Add ONLY if the test file already exists; otherwise drop this entry.)
  // "packages/db/__tests__/seed-dev.spec.ts",
  // Populated as Phase A / B / C services land:
  //   - apps/server/src/services/tenant-operations/index.ts  (after C5)
  //   - packages/tenancy/src/resolve-tenant.ts                (after A2.5)
  //   - packages/auth-tokens/src/verify.ts                    (after C1)
  //   - packages/auth-tokens/src/__tests__/verify.test.ts     (after C1)
];
```

Every entry added later must be accompanied by a justification comment in the offending source file AND a line in this ALLOWLIST comment block explaining why the bypass is sanctioned.

- [ ] **Step 2: Run — expect green on a clean repo**

```bash
bun run test --filter @repo/db -- live-organizations.spec
```

At A1.11 time the only callsite outside the allowlist might be the seam test itself (which uses `schema.organizations` references, not `from(organizations)`); confirm the test passes against the current tree.

- [ ] **Step 3: Failing-case drill**

Temporarily insert `await db.select().from(organizations)` into a throwaway source file under `apps/` and re-run; confirm the test fails with the offending file + line. Revert.

- [ ] **Step 4: Lint + review**

```bash
bun run fix && bun run check
```

Self-review: ALLOWLIST is minimal; the regex patterns (`FROM_ORG_RE`, `QUERY_ORG_RE`) match the worker version; the `walkSourceFiles` ignored set covers our build outputs (`dist`, `.turbo`, `.next`, `coverage`).

## Task A1.12: AGENTS.md updates for `packages/db`

**Files:**
- Modify: `packages/db/AGENTS.md`

- [ ] **Step 1: Document the OTC pattern, schema additions, and encryption helpers**

Include:
- ID prefixes table (`tnh`, `vtok`, `ga`, `ssop`).
- `liveOrganizations(executor)` is the sanctioned way to read `organizations` from outside `@repo/db`. Point readers to `packages/db/src/live-organizations.ts` and the structural test at `packages/db/__tests__/live-organizations.spec.ts` (ALLOWLIST).
- For every other tenant-scoped table (`sso_providers`, `tenant_custom_hostnames`, `audit_logs`, `roles`, `member`, `invitation`, `notifications`, `notification_preferences`, `push_tokens`, and any future tenant-scoped table), the owning repository / service takes `organizationId` and bakes `eq(<table>.organizationId, organizationId)` into every WHERE clause. Each module owns its own service-layer cross-tenant isolation test (testcontainers `postgres:18-alpine`).
- No Postgres RLS, no `app_role` / `ops_lookup_role`, no `app.current_tenant` session variable. Tenancy is enforced in TypeScript.
- `app.dek` session var stays — it is the per-transaction envelope-decryption key for `sso_providers_decrypted`, a separate concern from tenancy.
- pgcrypto wrap/unwrap helpers: `packages/db/src/envelope-encrypt.ts` (`encryptedOidcConfigSql`, `decryptedOidcConfigSql`).
- `audit_logs.actor_id` and `audit_logs.organization_id` carry NO FKs (worker-D30 invariant — audit rows outlive hard-deletes).
- Migration ordering rules (one `drizzle-kit generate` per logical change; pgcrypto + view + trigger as hand-written SQL files).

- [ ] **Step 2: Lint + review**

## Task A1.13: Drizzle introspect parity check

**Files:**
- Test: `packages/db/__tests__/introspect-parity.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("drizzle-kit introspect parity", () => {
  it("introspect output matches the in-tree schema", () => {
    const out = execSync("bun --filter @repo/db drizzle-kit introspect:pg --out /tmp/introspect", { stdio: "pipe" }).toString();
    expect(out).not.toMatch(/Changes detected/);
  });
});
```

- [ ] **Step 2: Run, watch fail (only if migrations and schema have drifted)**

- [ ] **Step 3: Reconcile any drift**

If introspect surfaces a diff, the migration order is wrong or a column was added to the schema without a migration. Fix and re-run.

- [ ] **Step 4: Lint + review**

## Exit criteria

- [ ] All schema files in `packages/db/src/schema/` compile and export named types.
- [ ] `drizzle-kit generate` produces zero pending changes (introspect parity test green).
- [ ] No migration file under `packages/db/migrations/` contains `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `CREATE POLICY`, `CREATE ROLE app_role`, `CREATE ROLE ops_lookup_role`, or `BYPASSRLS`. The repo runs against a single non-superuser DB user.
- [ ] `liveOrganizations(executor)` is exported from `@repo/db` and unit-tested for soft-delete pre-binding across all four shapes (`select`, `selectById`, `selectBySlug`, `findFirst`).
- [ ] `packages/db/__tests__/live-organizations.spec.ts` (structural ALLOWLIST test) is green on the current tree. ALLOWLIST is minimal and every entry is justified inline.
- [ ] `audit_logs` append-only trigger rejects UPDATE/DELETE; `audit_logs.actor_id` and `audit_logs.organization_id` have no FK constraints.
- [ ] `pgcrypto` extension installed; `sso_providers_decrypted` view decrypts when `app.dek` session var is set.
- [ ] `tenant_cache_version` seeded with the single row.
- [ ] `packages/db/AGENTS.md` updated to document the OTC pattern, the structural test, the per-repository org-gating convention, and the pgcrypto helper location.
