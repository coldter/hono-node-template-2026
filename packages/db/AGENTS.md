# @repo/db — Agent Guide

## TL;DR

- Schema lives in `src/schema/*.ts`. One table per file. Re-export from `src/schema/index.ts`.
- Migrations are produced by `drizzle-kit generate` (or `--custom` for triggers/extensions/views). Never hand-author `.sql` files.
- Read `organizations` via `liveOrganizations(executor)`. All other tenant-scoped tables: service / repository layer takes `organizationId` and bakes `eq(<table>.organizationId, organizationId)` into every WHERE.
- No Postgres RLS. No `app_role` / `ops_lookup_role`. Tenancy is enforced in TypeScript.

## ID prefixes

| Prefix | Model |
|--------|-------|
| usr | user |
| ses | session |
| acc | account |
| ver | verification |
| rol | role |
| aud | auditLog |
| ntf | notification |
| ptk | pushToken |
| rel | relation |
| tnh | tenantCustomHostname |
| vtok | verificationToken |
| ssop | ssoProvider |
| ga | globalAdmin |

## Reading `organizations`

`liveOrganizations(executor)` from `@repo/db` is the sanctioned way to read the `organizations` table from outside `@repo/db`. It returns four shapes (`select`, `selectById`, `selectBySlug`, `findFirst`), all of which pre-bind `WHERE deleted_at IS NULL` so callers cannot accidentally surface tombstoned tenants.

The structural CI test at `packages/db/__tests__/live-organizations.spec.ts` greps every `.ts`/`.tsx` in `apps/` and `packages/` for `from(organizations)` and `query.organizations.find{First,Many}` and fails on any callsite not in `ALLOWLIST`. To bypass the seam, add the file to `ALLOWLIST` with an inline justification comment AND a comment in the offending source file explaining the carve-out.

## Reading other tenant-scoped tables

`sso_providers`, `tenant_custom_hostnames`, `audit_logs`, `roles`, `member`, `invitation`, `notifications`, `notification_preferences`, `push_tokens`, and any future tenant-scoped table:

The owning repository / service takes `organizationId` as a parameter and bakes `eq(<table>.organizationId, organizationId)` into every WHERE clause. Each module owns its own service-layer cross-tenant isolation test (testcontainers `postgres:18-alpine`).

There is no `liveOrganizations`-style helper for these tables. Tenancy is enforced inline in the service layer because organization-scoping varies per call.

## Audit-log invariants

- `audit_logs.actor_id` has NO FK to `users(id)`.
- `audit_logs.organization_id` has NO FK to `organization(id)`.

Audit rows outlive hard-deleted users and organizations (forensic record). Cascading deletes or FK validation against the live row would defeat that.

The `audit_logs_no_mutation` trigger raises an exception on UPDATE or DELETE — `audit_logs` is append-only at the DB level.

## pgcrypto + envelope encryption

The `pgcrypto` extension is installed via migration. The `sso_providers_decrypted` view exposes `oidc_config` (plaintext) via `pgp_sym_decrypt(oidc_config_encrypted, current_setting('app.dek', true))`. To read decrypted config from app code:

1. Wrap the read in a transaction.
2. Set the per-transaction key with `SELECT set_config('app.dek', $1, true)` where `$1` is the hex-encoded DEK.
3. Read from `sso_providers_decrypted` scoped by `organizationId` AND `id`.
4. The DEK should be unwrapped from the per-tenant EDEK (`oidc_config_edek`) via the vault helper.

This is separate from tenancy enforcement — it is per-transaction OIDC client-secret protection.

## Migration rules

1. Generate via drizzle-kit. **Never hand-author `.sql` files in `src/migrations/`.**
2. Schema-derived migrations: `bun --filter server db:generate` (the script is in `apps/server`).
3. DDL drizzle-kit cannot infer (triggers, extensions, views, raw functions, seeds): `bunx drizzle-kit generate --custom --name <descriptive_name>`. Drizzle-kit produces an empty migration file already wired into the snapshot — hand-author the SQL inside it.
4. One `drizzle-kit generate` invocation per logical change.
5. The introspect-parity test at `packages/db/__tests__/introspect-parity.test.ts` asserts there are no pending schema to migration drifts.

## Helpers

- `liveOrganizations(executor)` — see "Reading `organizations`" above.
- `columns.ts` — `createdAt()` and `updatedAt()` factories. Always use these in new tables.
- `bytea` custom type — declared inline per table that needs binary columns (`sso-providers.ts`, `global-admins.ts`).

## Testing

- Behavioral tests only. Skip schema-shape / migration-string tests — they exercise Drizzle/drizzle-kit, not our code.
- Testcontainers-driven integration tests use `__tests__/helpers/with-test-db.ts` which spins a `postgres:18-alpine` container and applies every migration in timestamp order.
- The structural ALLOWLIST test is a CI invariant — when adding code that legitimately bypasses the seam, update the ALLOWLIST in the same change with a justification.
- The introspect-parity test (`__tests__/introspect-parity.test.ts`) detects schema-to-migration drift without a live database. Run it before opening a PR that touches schema files.
