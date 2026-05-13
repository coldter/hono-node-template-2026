# 11 — Gotchas

Known sharp edges that bit us during research or have open issues in the linked upstreams. Each one has a mitigation; if the mitigation breaks during plan execution, escalate to spec revision.

## Better Auth 1.6.x

### G-BA-1: `admin.createUser` bypasses `databaseHooks.user.create.before`

The defense-in-depth reject hook for `disableSignUp` does NOT fire when the admin plugin creates users (BA issue #3389). This is intentional from BA's perspective — admin path is meant to override.

**Implication:** Operator-side invitation acceptance (B2) must use `admin.createUser`. Tenant-side sign-up surface must NOT expose this path.

**Mitigation:** Audit-log every `admin.createUser` call with the operator's `actor_id` and the resulting `user.id`. Add a `auth.admin_user_created` CRITICAL audit row. Source: https://github.com/better-auth/better-auth/issues/3389

### G-BA-2: `storeSessionInDatabase` + `secondaryStorage` interactions

Open issues #6993 (KV-stored sessions lacking `id`), #6987 (`updateSession` not always syncing back), #5687 (`additionalFields` lost with secondaryStorage).

**Mitigation:** Pick ONE — either `storeSessionInDatabase: true` OR `secondaryStorage: redis`, not both. The spec picks `storeSessionInDatabase: true` (load-bearing for `sessionVersion` revocation). If a Redis secondary store becomes necessary later, write a characterization test that exercises all three bugs before adoption.

### G-BA-3: Organization plugin has no native `enforce_sso`

Documented in [03-auth-and-sso.md](./03-auth-and-sso.md). Custom additional field + `databaseHooks.session.create.before` hook. Watch for hook-order conflicts with `organizationProvisioning.getRole`.

**Mitigation:** A6 contract test asserts that an SSO-enforced org rejects credentials login AFTER `organizationProvisioning` runs.

### G-BA-4: `disableSignUp` lives under `emailAndPassword`, not top-level

Don't grep for `disableSignUp:` at the top level of the BA config — it's nested.

## Drizzle ORM 0.45 / 1.0-RC

### G-DZ-1: 1.0-RC.1 is RC, not stable (May 2026)

Spec pins 0.45.x for Phase A. A Phase D migration to `defineRelations` v2 is queued for once 1.0 stable lands. If you skip ahead to 1.0-RC, expect API churn — at minimum the `relations()` → `defineRelations` conversion, and the `drizzle({ casing })` → `snakeCase`/`camelCase` namespace conversion.

### G-DZ-2: pgcrypto + Drizzle `customType` is awkward

`customType.toDriver` can't return SQL fragments cleanly. We use raw `sql` helpers at call sites (`pgp_sym_encrypt`/`pgp_sym_decrypt`). `bytea()` column type IS first-class in 0.45.x.

## Hono / Node

### G-H-1: CVE-2026-29045 (Hono) and CVE-2026-39406 (`@hono/node-server`)

Both relate to `serveStatic` middleware bypass via repeated slashes. **Mitigation:** pin `hono ^4.12.4` and `@hono/node-server ^1.19.13`. Add a startup version assertion in `apps/server/src/index.ts` that throws on older versions to prevent accidental downgrade.

### G-H-2: `@hono/otel` middleware ordering

`httpInstrumentationMiddleware` MUST be the first registered middleware. Otherwise downstream loggers (Pino) get empty `trace_id`/`span_id`. This is the #1 reported issue in `@hono/otel` 2026. Source: https://www.technetexperts.com/hono-otel-pino-trace-id-fix/

### G-H-3: Hono `c.var` vs `c.get(...)` type narrowing

When using `ContextVariableMap` augmentation, prefer `c.var.tenant` (typed) over `c.get("tenant")` (returns `any` in some Hono versions). Already an established pattern in the repo.

## Postgres / tenant scoping

### G-PG-1: Missed `organizationId` filter is a tenancy leak

Tenant isolation is enforced in application code (ND12). Forgetting `eq(<table>.organizationId, organizationId)` in a single WHERE clause is a cross-tenant data leak. Two defenses:

1. **For `organizations` itself**, the structural CI test in `packages/db/__tests__/live-organizations.spec.ts` greps the tree for `from(organizations)` and `query.organizations.findFirst|findMany` and fails any callsite not on the documented ALLOWLIST. Use `liveOrganizations(executor)` from `@repo/db` — it pre-binds `WHERE deleted_at IS NULL` and is the only supported read shape.
2. **For every OTHER tenant-scoped table** (`sso_providers`, `tenant_custom_hostnames`, `audit_logs`, `roles`, `member`, `invitation`, `notifications`, etc.), the owning module ships a service-layer isolation test (run inside testcontainers `postgres:18-alpine`) asserting that a query with `organizationId=A` returns zero rows belonging to `organizationId=B`. Canonical scoping pattern at `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo.

There is no `app.current_tenant` session variable safety net. The structural test + per-module isolation tests are the safety net.

### G-PG-2: `app.dek` / `app.sso_key` are NOT for tenant isolation

Two `SET LOCAL` session vars remain in the stack — `app.dek` (DB-side OIDC envelope decryption) and `app.sso_key` (SSO secret encryption). They live entirely inside `withDecryptedSecret(...)` / `create` / `rotateEncrypted` in `ssoProviderRepository`, scoped to a single transaction (`SET LOCAL`), and never carry tenant identity. Do not reuse this pattern for tenant scoping — that is what `organizationId` arguments are for.

### G-HE-1: Hatchet event delivery is best-effort

If the post-commit `hatchet.events.push("tenancy.invalidate", ...)` fails (network blip, Hatchet brownout), the bump to `tenant_cache_version.version` is still durable in Postgres. Every cache miss reads the version row, so a lost event self-heals within one positive-TTL window (60s). Do NOT replace the version-key read with the event stream alone.

### G-HE-2: Publish AFTER commit, never inside the transaction

Hatchet events live outside the DB transaction. Publishing inside the transaction can fire an event for a write that later rolls back. Always commit first, then push. The version-key read is the safety net for the inverse case (publish fails after commit).

### G-HE-3: Hatchet event payload size

Hatchet supports multi-KB JSON payloads, but for invalidation we send only `{ host?: string; event?: "bump_all" }`. Keep it minimal to reduce broadcast latency.

## Caddy

### G-CD-1: `permission http` REPLACES `ask` (not stackable)

Use only `permission http`. Stacking both produces a Caddy config error.

### G-CD-2: No admin API DELETE for cert revocation

To revoke: delete the cert key from cluster storage (Redis), then `POST /load` on the admin API to reload config. OCSP polling auto-replaces revoked certs but doesn't help with our forced-removal flow. Encoded in `customHostnameLifecycle.remove()`.

### G-CD-3: Caddy 2.11 wildcard-by-default

Caddy 2.11 introduced default wildcard behavior for sibling subdomains. **Mitigation:** explicitly scope our wildcard site block to `*.app.example.com` (not just `*`), and add a deny-all catch-all `:443 { abort }` at the end.

### G-CD-4: On-demand TLS rate limits

Let's Encrypt rate limits: 50 certs / registered domain / week, 5 duplicate certs / week. **Mitigation:** add Caddy `interval` + `burst` limits on `on_demand_tls`, and our `/caddy/ask` returns 429 if a per-org limit is exceeded.

## Hatchet

### G-HT-1: Cron is UTC-only and minimum 1 minute

Document in runbook. For sub-minute, re-enqueue from inside the task with a `setTimeout` + recursive enqueue, or use Hatchet's scheduled-run API.

### G-HT-2: Cron expression is enqueue time

If concurrency or rate-limit delays start, the cron drift can accumulate. The reconciler is idempotent (uses `last_reconciled_at > now() - 50s` filter) — drift is harmless.

### G-HT-3: Declarative cron overrides dashboard cron

Pick one source of truth. Spec mandates declarative in workflow code; dashboard cron is disabled by convention.

## Storage / S3

### G-S3-1: MinIO is archived (2026)

The OSS repo is archived Feb 2026; all dev went to proprietary MinIO AIStor. **Do not use.** SeaweedFS for production, RustFS for dev.

### G-S3-2: RustFS is alpha

Distributed mode not officially released. Single-node alpha is adequate for dev. Re-evaluate for production in late 2026.

### G-S3-3: `@aws-sdk/lib-storage` `Upload` for multipart

Don't roll your own `CreateMultipartUpload`/`UploadPart` loop. `Upload` class handles part size + concurrency + progress correctly.

### G-S3-4: `forcePathStyle: true` for self-hosted

Required for SeaweedFS / RustFS. Real AWS S3 ignores it. Env-flag the value.

## Misc

### G-X-1: Bun 1.3 isolated installs

Default in 1.3. May break code that imports transitive deps. **Mitigation:** add explicit dependency entries for anything we import directly. CI catches this.

### G-X-2: TypeScript `tsgo` is type-check-only (May 2026)

Don't use `tsgo` for emit yet. `tsc` for emit, `tsgo --noEmit` for CI type-check.

### G-X-3: Vitest 4.1 browser provider is a separate package

Install `@vitest/browser-playwright`. Import context from `vitest/browser`, not `@vitest/browser/context`.

### G-X-4: shadcn CLI v4 `--monorepo` flag

`bunx shadcn@latest init --monorepo`. Components install into `packages/ui`, glue into `apps/*`. Don't manually copy components into apps.

## Open question backlog

| # | Question | When to resolve |
|---|---|---|
| Q1 | Drizzle 1.0 stable adoption | When 1.0 stable lands; queue Phase D migration |
| Q2 | BA `enforce_sso` enforcement hook ordering vs `organizationProvisioning.getRole` | A4 testing |
| Q3 | DNS provider for Caddy wildcard DNS-01 | Phase 0 — document chosen plugin in `deploy/Dockerfile` |
| Q4 | Pomerium vs in-app role gate as production default | Re-evaluate at >25 operators |
| Q5 | `apps/web` rename to `apps/app` confirmed | B3 start |
| Q6 | Whether `apps/admin-server` ships admin UI or Caddy `file_server` does | B3 start; spec default: Caddy serves |
| Q7 | Vault provider for KEK custody in prod | Phase 0 — confirm `aws-kms` vs `gcp-kms` vs `azure-keyvault` based on hosting |
