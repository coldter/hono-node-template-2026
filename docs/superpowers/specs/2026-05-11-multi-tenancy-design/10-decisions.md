# 10 — Decisions

Locked decisions. D-numbers preserve worker plan numbering where intent matches; ND-numbers are Node-only additions.

## Worker plan decisions ported verbatim (intent)

| # | Decision | Lands in |
|---|---|---|
| D1 | Default subdomain `{slug}.${APP_WILDCARD_HOST}` | 01, 02 |
| D2 | OIDC + email/password day-one (SAML deferred) | 03 |
| D3 | `organization.enforce_sso` column (custom field via BA additional fields + hook) | 03, 08 |
| D4 | Hybrid: `organization.slug` canonical + `tenant_custom_hostnames` table | 02, 04, 08 |
| D8 | Auto-link only when `email_verified` AND existing membership AND `domainVerified` | 03 |
| D11 | Tenant context passed via Hono context variable (NOT HMAC header) | 02 |
| D12 | JWT `aud`/`iss` per-tenant URL-form + `org` claim with `id`, `host`, `sessionVersion` | 03 |
| D15 | Host-only cookies + explicit Origin/CSRF on tenancy/admin mutations | 03, 09 |
| D16 | Tombstone slugs and hostnames in `reserved_slugs` | 02, 08 |
| D17 | Reserved-slug denylist + NFC + `xn--` reject + slug regex | 02 |
| D20 | Operators in dedicated `global_admins` table | 05, 08 |
| D21 | `"global_admin"` added to roles; new `tenant`/`platform` resources | 05 |
| D22 | BA `organization.create` always rejects via `before` hook | 03 |
| D23 | Tenant admin invited via existing org-plugin `invitation` table | 05 |
| D25 | `ACTOR_TYPES.GLOBAL_ADMIN` + dual-scope CRITICAL audit | 05, 09 |
| D26 | Global-admin sessions are stateless | 05 |
| D27 | `parseHostname` rejects `ADMIN_HOST` and unknown hosts | 02, 09 |
| D30 | `audit_logs.actor_id` FK dropped + `organization_id` + append-only trigger | 08, 09 |
| D31 | First-login binding via enrollment-token (24h TTL) | 05 |
| D32 | `disableSignUp: true` globally | 03 |
| D33 | `admin.support.query` CRITICAL with row cap + per-operator rate limit | 05, 09 |
| D34 | Tenant suspension revokes sessions + bumps `session_version` | 03 |
| D36 | `whereGlobalAdminRole(...subRoles)` builder method | 07 |
| D37 | Soft-delete + tombstone unified | 02, 08 |
| D39 | `apps/web` → `apps/app` rename | 06 |
| D40 | New tenant SPA app | 06 |
| D41 | Each web app generates its own typed API client | 06 |
| D42 | Admin server exports OpenAPI spec | 05 |
| D43 | `packages/ui` (NEW) holds Radix/shadcn + Tailwind config + Storybook | 06, 07 |
| D44 | Tenant SPA `auth-client.ts` uses `baseURL: window.location.origin` | 06 |
| D47 | Tenant SPA BA client plugins | 06 |
| D48 | `/accept-invite/:invitationId` outside `(protected)` | 06 |
| D49 | Per-tenant branding v1 (logo + color + name) | 06 |
| D52 | `authenticateOperator` unified middleware | 05 |
| D53 | `@repo/auth-tokens` package — `verifyTenantJwt` 8-invariant check | 03, 07 |
| D54 | `tenantOperations` service — single owner of CRUD | 07 |
| D55 | `requireOperator(action) → middleware` + `OPERATOR_PERMISSIONS` | 05 |
| D56 | `ssoProviderRepository` with `withDecryptedSecret(providerId, fn)` | 03, 07 |
| D57 | `customHostnameLifecycle` service in `apps/server` | 04, 07 |
| D58 | Tenant SPA minimal fetch handler + SPA fallback | 06 |
| D60 | `/accept-invite/:invitationId` recovery handles BA `USER_ALREADY_EXISTS` | 05 |
| D61 | Branding logos in S3-compatible storage; CSP `img-src` allowlist | 06, 09 |
| D64 | `/sso/callback` is NOT a tenant SPA route | 03, 06 |
| D65 | Cookie `Domain` stays unset on custom hostnames | 03, 09 |
| D67 | `tenantOperations.by` accepts `GlobalAdmin \| SystemActor` | 07 |
| D68 | `@repo/tenancy` invalidator factored asymmetrically (`Invalidator` vs `FanOutInvalidator`) | 02 |
| D69 | `authenticateOperator` returns discriminated `AuthFailure`; `JwksCache` class | 05, 07 |
| D70 | `@repo/auth-tokens` is verifier-side only; BA continues to mint | 03, 07 |
| D71 | `OperatorAction` type DERIVED from `OPERATOR_PERMISSIONS` keys | 05 |
| D72 | `whereGlobalAdminRole` and `OPERATOR_PERMISSIONS` matrix coexist | 05 |
| D73 | SSO secret encryption via Postgres + envelope (Phase C boundary) | 03, 08 |
| D76 | Apex of `APP_WILDCARD_HOST` serves a static "Find your team" page | 01, 06 |
| D77 | Self-serve onboarding retracted | 03, 05 |
| D78 | `/api/tenancy/current` final response shape | 06 |

## Worker plan decisions explicitly dropped or replaced

| # | Reason |
|---|---|
| D5, D6, D7, D9, D14 | Cloudflare for SaaS-specific. Replaced by ND1 (Caddy on-demand) and ND9 (Hatchet reconciler). |
| D10, D28 | Workers Cache API + KV cache version. Replaced by ND3 (Hatchet events) and ND4 (lru-cache@11). |
| D13 | CF Secrets Store. Replaced by ND11 (`apps/server/src/lib/vault`). |
| D18, D19 | Separate `apps/admin` worker + CF Access. Replaced by ND6 (in-process admin process) and ND7 (env-flagged perimeter). |
| D29 | `workers_dev: false`. Replaced by `hostHeaderGuard` middleware (structural fail-closed). |
| D38 | CF Access JWT verification. Replaced by ND7 (Pomerium HMAC trust + in-app role). |
| D45 | `apps/app` service-binding API proxy. N/A in Node — same-process. |
| D46, D59 | `X-Dev-Tenant-Slug` two-factor gate. PORTED in spirit (kept) but lives entirely in `@repo/tenancy/dev-header.ts`; env flag is `ALLOW_DEV_TENANT_HEADER`. |
| D50 | Turbo `generate-client` depends on `^generate-openapi`. PORTED but framed in turbo.json. |
| D51 | `@repo/tenancy` lands in Phase A. PORTED. |
| D62 | Reuse existing `generate-openapi` Turbo task name. PORTED. |
| D63 | `apps/admin` ASSETS binding. Replaced by Caddy `file_server`. |
| D66 | `tenantOperations.rename`. Deferred to v2. |
| D74 | `customHostnameLifecycle` co-located in `apps/server`. PORTED. |
| D75 | Phase 0 validates BA SSO schema + state model. PORTED. |

## New Node-only decisions

| # | Decision | Lands in |
|---|---|---|
| ND1 | **Caddy 2.11.2 on-demand TLS with `permission http`** (not `ask`); cluster storage via `pberkel/caddy-storage-redis`; DNS-01 wildcard via env-pluggable plugin (default `caddy-dns/cloudflare`) | 04 |
| ND2 | **6-state** custom-hostname lifecycle (drop `pre_validation`) | 04, 08 |
| ND3 | **Hatchet events** for cross-process tenancy-cache invalidation (event key `tenancy.invalidate`). Hatchet is already in the stack — using its event bus instead of introducing Postgres LISTEN/NOTIFY avoids adding a second pub/sub transport. The cache-version key in Postgres (`tenant_cache_version` row) remains the source of truth — Hatchet event delivery is best-effort, the 60s positive TTL is the safety net, and a missed event is recovered on the next miss via the version-key read. | 02 |
| ND4 | Per-process `lru-cache@11` (positive 60s, negative 5s, max 10k) | 02 |
| ND5 | `@repo/shared/wait-until.ts` — bounded SIGTERM tracker | 07 |
| ND6 | Two Node processes (`apps/server` + `apps/admin-server`). `apps/auth` worker is co-located in `apps/server` | 01 |
| ND7 | Admin perimeter env-flagged: `in_app` (default, BA + `global_admins`) or `oidc_proxy` (Pomerium front + HMAC trust header) | 05 |
| ND8 | S3-API everywhere; **SeaweedFS** prod default, **RustFS** dev. MinIO excluded (archived 2026) | 06 |
| ND9 | Hatchet `on: { cron: "* * * * *" }` for the reconciler; 1-min minimum granularity (UTC) | 04 |
| ND10 | JWT layered revocation: short-lived (15min) + `sessionVersion` mass-revoke + `jti` Redis short-list per-token kill + URL-form `aud`/`iss` only | 03 |
| ND11 | OIDC secret envelope encryption: per-tenant KEK in Vault, DEK next to ciphertext, pgcrypto AES-256 inside the envelope. Bare pgcrypto rejected. | 03, 08 |
| ND12 | Application-layer tenant scoping: `liveOrganizations(executor)` sanctioned read seam in `@repo/db`, service / repository-layer `organizationId` gating for every other tenant-scoped table, structural ALLOWLIST CI test in `packages/db/__tests__/live-organizations.spec.ts`, per-module cross-tenant isolation tests at the service layer. Single non-superuser DB user; no `app.current_tenant` session var; no `app_role` / `ops_lookup_role` split. (`app.dek` and `app.sso_key` STAY — they are per-transaction OIDC envelope-encryption key passing, not tenancy.) | 08, 09 |
| ND13 | `audit_logs.actor_id` and `audit_logs.organization_id` carry **no FK** — rows must outlive hard-deletes of users and tenants (worker D30 port). The append-only `audit_logs_no_mutation` trigger remains the DB-level invariant for log immutability. | 08, 09 |

## Version pins (May 2026 baseline)

| Package | Pin | Source |
|---|---|---|
| Caddy | `2.11.2` | https://github.com/caddyserver/caddy/releases |
| `pberkel/caddy-storage-redis` | `>= 1.6.x` | https://github.com/pberkel/caddy-storage-redis |
| Postgres image | `postgres:18-alpine` | (Drop the `postgis/postgis` image unless PostGIS is actually used) |
| Redis | `redis:8` | (existing compose) |
| Bun | `1.3.x` | https://bun.com/docs/pm/workspaces |
| TypeScript | `^6.0` (tsc for emit) + `@typescript/native-preview` (tsgo for `--noEmit`) | https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/ |
| Biome | `^2.3` | https://biomejs.dev/guides/migrate-eslint-prettier/ |
| Hono | `^4.12.4` (CVE-2026-29045) | https://github.com/honojs/hono/releases |
| `@hono/node-server` | `^1.19.13` (CVE-2026-39406) | https://advisories.gitlab.com/pkg/npm/@hono/node-server/CVE-2026-39406/ |
| `@hono/zod-openapi` | `^1.3.0` | https://www.npmjs.com/package/@hono/zod-openapi |
| `@hono/otel` | latest | https://www.npmjs.com/package/@hono/otel |
| Zod | `^4.x` (use `z.treeifyError`) | https://zod.dev/v4/changelog |
| Better Auth | `^1.6.9` | https://better-auth.com/blog/1-6 |
| `@better-auth/sso` | matches BA major | https://better-auth.com/docs/plugins/sso |
| Drizzle ORM | `^0.45.x` stable (1.0-rc.1 documented; deferred until 1.0 stable) | https://orm.drizzle.team/docs/latest-releases |
| `drizzle-kit` | matches Drizzle major | |
| `pg` | `^9.x` | https://node-postgres.com/ |
| `lru-cache` | `^11.x` | https://www.npmjs.com/package/lru-cache |
| Redis client | `redis` (node-redis) `^5.x` as default; `ioredis` only if BullMQ enters scope | https://redis.io/docs/latest/develop/clients/nodejs/migration/ |
| `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` | latest v3 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html |
| `sharp` | `^0.34.5` | https://sharp.pixelplumbing.com/ |
| Hatchet client | latest (verify on adoption) | https://docs.hatchet.run/ |
| `tangerine` (DoH) | latest | https://forwardemail.net/en/blog/docs/node-js-dns-over-https |
| React | `19.2.6` | https://react.dev/versions |
| Vite | `^8.x` (Rolldown default) | https://vite.dev/blog/announcing-vite8 |
| TanStack Router | `^1.169.x` | https://tanstack.com/router/latest |
| TanStack Query | `^5.100.x` | https://github.com/tanstack/query/releases |
| TanStack Table | `^8.21.x` (NOT v9 alpha) | https://github.com/TanStack/table/releases |
| Tailwind CSS | `^4.x` (CSS `@theme`) | https://tailwindcss.com/blog/tailwindcss-v4 |
| shadcn CLI | `^v4` (`--monorepo`) | https://ui.shadcn.com/docs/monorepo |
| Storybook | `^10.x` + `@storybook/addon-vitest` (NOT `@storybook/test-runner`) | https://storybook.js.org/docs/writing-tests/integrations/vitest-addon |
| Vitest | `^4.1.x` | https://vitest.dev/blog/vitest-4-1.html |
| `@hey-api/openapi-ts` | latest pre-1.0 (pin exact) | https://github.com/hey-api/openapi-ts |
| Testcontainers Node | `@testcontainers/postgresql` latest | https://node.testcontainers.org/modules/postgresql/ |

All version pins re-verified at the start of each phase (Phase 0 task: `bun pm ls` + WebSearch any pin with a documented CVE since spec-write date).
