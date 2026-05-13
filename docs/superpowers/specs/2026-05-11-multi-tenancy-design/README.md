# Multi-Tenancy Design Spec (Node/Hono Port)

> **Status:** Draft, dated 2026-05-11. Adapts the Cloudflare Workers multi-tenancy plan at `/home/kuldeep/code/personal/worker-template-2026/docs/superpowers/plans/2026-05-06-multi-tenancy/` to the Node/Hono runtime in this repo, swapping every Cloudflare-proprietary primitive for an open-source equivalent. Git commits are not part of this task.

## Summary

This spec covers a B2B SaaS multi-tenancy layer for the Node template:

- Host-based tenant resolution via a wildcard subdomain (`{slug}.app.example.com`) plus customer-supplied custom hostnames (`app.acme.com`).
- Better Auth 1.6.x configured for per-tenant `baseURL.allowedHosts` + per-tenant cookies + per-tenant OIDC SSO providers.
- A 7-state custom-hostname lifecycle reduced to 6 states for Caddy (no `pre_validation`).
- Caddy 2.11.x reverse proxy with on-demand TLS for custom hostnames and DNS-01 wildcard cert for the subdomain space.
- Split web frontend: `apps/admin-ui` (operator) + `apps/app` (tenant SPA, renamed from `apps/web`).
- Split server: `apps/server` (tenant edge, BA, custom hostnames) + `apps/admin-server` (operator API).
- Hatchet events (`tenancy.invalidate`) for cross-process tenancy-cache invalidation; in-process `lru-cache@11` for hot lookups; Postgres `tenant_cache_version` row as the durable source of truth.
- Application-layer tenant scoping via `liveOrganizations` read seam, service-layer `organizationId` gating, and a structural ALLOWLIST CI test.
- Layered JWT revocation: `sessionVersion` claim + `jti` Redis short-list + short-lived access tokens.
- Envelope-encrypted OIDC client secrets (KMS-wrapped DEK), not bare pgcrypto.

## Read order

| # | Doc | Owns |
|---|---|---|
| 1 | [01-architecture.md](./01-architecture.md) | Topology, processes, host map, OSS substitution table |
| 2 | [02-tenant-resolution.md](./02-tenant-resolution.md) | `@repo/tenancy` package, host parsing, two-tier cache, Hatchet-event invalidation |
| 3 | [03-auth-and-sso.md](./03-auth-and-sso.md) | Better Auth 1.6.9 multi-tenant config, sanitized request boundary, SSO plugin (OIDC), JWT layered revocation |
| 4 | [04-custom-hostnames.md](./04-custom-hostnames.md) | Caddy on-demand TLS + `permission http` ask endpoint + Hatchet reconciler + 6-state lifecycle |
| 5 | [05-admin-panel.md](./05-admin-panel.md) | `apps/admin-server`, `global_admins`, in-app role gate, optional Pomerium opt-in, enrollment token |
| 6 | [06-web-layer.md](./06-web-layer.md) | `apps/admin-ui`, `apps/app`, `packages/ui` (shadcn CLI v4 monorepo), per-tenant branding (S3-API/SeaweedFS) |
| 7 | [07-deeper-modules.md](./07-deeper-modules.md) | Package layout: `@repo/tenancy`, `@repo/auth-tokens` (verifier-only), `@repo/ui`, extensions to `@repo/authorization` |
| 8 | [08-schema-and-migrations.md](./08-schema-and-migrations.md) | Drizzle 0.45.x schema delta, application-layer tenant scoping (OTC) pattern, pgcrypto + envelope encryption columns, migration order |
| 9 | [09-security.md](./09-security.md) | Sanitized auth proxy, host-header guard, cookies, CSP, application-layer tenant scoping, JWT verification matrix |
| 10 | [10-decisions.md](./10-decisions.md) | Locked decisions D1–D78 (adapted from worker plan) + new Node-only decisions ND1–ND13 |
| 11 | [11-gotchas.md](./11-gotchas.md) | Known sharp edges (BA admin-plugin bypass, Drizzle 1.0-RC churn, missed `organizationId` scoping, Caddy 2.11 wildcard) |
| 12 | [12-testing-and-local-dev.md](./12-testing-and-local-dev.md) | testcontainers postgres:18-alpine, `*.localhost` resolution, Caddy `tls internal`, ioredis-mock vs real Redis |

## Phasing

| Phase | What lands | Deployable at end? |
|---|---|---|
| **0 — Validation spike** | Locks the load-bearing decisions before any code lands: host-parsing edge cases, Caddy `permission http` contract, Hatchet event publish→subscribe round-trip latency, BA 1.6 SSO column shape on Drizzle 0.45, sanitized BA proxy header matrix, `*.localhost` vs `lvh.me` for dev hosts, envelope-encryption key strategy. | No |
| **A — Core multi-tenancy** | A1 schema (`tenant_custom_hostnames` + `sso_providers` + `reserved_slugs` + `global_admins` + organization columns + `audit_logs` reshape + `liveOrganizations` read seam + structural CI test) · A2 `@repo/tenancy` · A3 BA multi-tenant config · A4 SSO plugin · A5 Caddy custom hostnames + Hatchet reconciler · A6 layered JWT + sessions · A7 local-dev harness | **Yes** |
| **B — Admin panel + web split** | B1 `apps/admin-server` · B2 operator onboarding · B3 `apps/admin-ui` (rename of `apps/web` to `apps/app` + new `apps/admin-ui`) · B4 `apps/app` SPA shell · B5 `packages/ui` (shadcn CLI v4 monorepo) · B6 per-tenant branding · B7 frontend tooling (typed clients) | **Yes** |
| **C — Deepening** | C1 `@repo/auth-tokens` (verifier-side) · C2 operator auth/authz consolidation · C3 custom-hostname lifecycle service extraction · C4 SSO provider repository (envelope encryption boundary) · C5 tenant operations service · C6 route cleanup | **Yes** (refactor with characterization tests) |

## Cross-cutting decisions (Node-only adaptations of worker plan)

Decisions retain worker plan numbering D1–D78 where the underlying intent is identical; new Node-only decisions are numbered ND1–ND13. The authoritative list lives in [10-decisions.md](./10-decisions.md).

### Highest-impact Node-only decisions
| # | Decision |
|---|---|
| ND1 | Custom-hostname provisioning uses **Caddy 2.11.2 on-demand TLS with `permission http`** (not the legacy `ask` directive — they are alternatives, not stackable). Caddy storage uses `pberkel/caddy-storage-redis` for the cluster-coordination case. |
| ND2 | The 7-state custom-hostname lifecycle from the worker plan collapses to **6 states** (`pending_txt`, `awaiting_caddy`, `active`, `failed`, `removing`, `removed`). The `pre_validation` state belonged to a CF-specific window between TXT acceptance and validation-record availability that has no Caddy analogue. |
| ND3 | Cross-process tenancy-cache invalidation uses **Hatchet events** (event key `tenancy.invalidate`). Hatchet is already in the stack — using its event bus avoids introducing a second pub/sub transport. The `tenant_cache_version` row in Postgres remains the durable source of truth; the Hatchet event is best-effort fan-out, and the 60s positive TTL is the safety net for missed events. |
| ND4 | Per-isolate cache (worker plan A2 D10) becomes **per-process `lru-cache@11` with `.fetch()` for SWR**. Positive TTL 60s, negative TTL 5s, max 10k entries. Combined with the Hatchet event subscriber + version-key bump this gives the same fast-revalidation semantics as the worker plan's Cache API + KV version key. |
| ND5 | `waitUntil(p)` becomes **`@repo/shared/wait-until.ts`** — an in-process tracked-promise set with a 5s bounded await on graceful shutdown (SIGTERM). |
| ND6 | Two Node processes (`apps/server` + `apps/admin-server`) replace the worker plan's five workers. The worker plan's `apps/auth` worker is **co-located in `apps/server`** — sanitization at the BA proxy boundary still happens but via an in-process function call, not an RPC. |
| ND7 | Admin perimeter is **env-flagged**: `ADMIN_PERIMETER=in_app` (default — BA session + `global_admins` row) or `ADMIN_PERIMETER=oidc_proxy` (Caddy fronts admin host with **Pomerium**; admin-server validates an HMAC-signed `X-Forwarded-By-Trusted-Proxy` header before reading `X-Auth-Request-*`). Pomerium picked over oauth2-proxy because of its multi-route policy model and 2026 community trend; Pocket-ID is the documented passkey-first IdP for self-hosters. |
| ND8 | Branding asset storage uses **S3 API everywhere** (`@aws-sdk/client-s3` + `@aws-sdk/lib-storage`). Local-dev runs **RustFS** (alpha but adequate for dev). Production default is **SeaweedFS** — MinIO is archived OSS as of Feb 2026 and excluded. Backend is env-pluggable (`S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE`). |
| ND9 | The 60s custom-hostname reconciler runs on **Hatchet** (`on: { cron: "* * * * *" }`). 1-minute is the minimum cron granularity; the workflow checks `lastReconciledAt > 50s` to enforce ~60s spacing per row. Sub-minute polling, if ever needed, re-enqueues from inside the task. |
| ND10 | JWT revocation is **layered**: BA `jwt` plugin mints with `aud`/`iss` in URL form (`https://<tenant.host>`) and includes `org.sessionVersion`. Access tokens are 15-minute lifetime; long-running clients refresh against the BA `session` cookie. A `jti` Redis short-list (TTL = remaining access-token lifetime) supports immediate per-token kill on logout. URN-form `aud`/`iss` rejected per 2026 interop consensus. |
| ND11 | OIDC client secrets are encrypted with **envelope encryption**: per-tenant KEK held by the configured vault (`apps/server/src/lib/vault` — already abstracts local AES-256-GCM, AWS KMS, GCP KMS, Azure Key Vault) wraps a DEK that lives next to the ciphertext as `oidc_config_edek`. pgcrypto remains the symmetric primitive inside the envelope (`pgp_sym_encrypt` with AES-256). The `sso_providers_decrypted` SECURITY DEFINER view stays for read-side convenience but the envelope KEK is the security boundary. Raw pgcrypto-with-key-in-env is explicitly rejected. |
| ND12 | Tenant isolation is enforced **in application code, not by Postgres RLS**. `@repo/db` ships `liveOrganizations(executor)` as the sanctioned read seam for the `organizations` table (pre-binds `WHERE deleted_at IS NULL`); `packages/db/__tests__/live-organizations.spec.ts` is a structural CI test that fails any `from(organizations)` / `query.organizations.findFirst|findMany` callsite not on a documented ALLOWLIST. Every other tenant-scoped table (`sso_providers`, `tenant_custom_hostnames`, `audit_logs`, `roles`, `member`, `invitation`, `notifications`, etc.) is gated by a repository / service that takes `organizationId` and bakes `eq(<table>.organizationId, organizationId)` into every WHERE clause; each module owns a cross-tenant isolation test at the service layer. The DB connects as a single non-superuser user; there is no `app.current_tenant` session var and no `app_role` / `ops_lookup_role` split. `app.dek` and `app.sso_key` stay — those are per-transaction OIDC envelope-encryption key passing, a different concern from tenancy. |
| ND13 | `audit_logs.actor_id` and `audit_logs.organization_id` carry **no FK** so rows outlive hard-deletes of users and tenants (worker D30 port). The append-only `audit_logs_no_mutation` trigger remains the DB-level invariant for log immutability. |

### Locked decisions ported from worker plan (verbatim intent)
D1, D2, D3, D4, D8, D11, D12, D15, D16, D17, D20, D21, D22, D23, D25, D26, D27, D30, D31, D32, D33, D34, D36, D37, D39, D40, D41, D42, D43, D44, D47, D48, D49, D52, D53, D54, D55, D56, D57, D58, D60, D61, D64, D65, D67, D68, D69, D70, D71, D72, D73, D76, D77, D78.

### Worker decisions dropped (irrelevant or replaced)
- D5, D6, D7, D9, D14: CF for SaaS specifics → replaced by ND1, ND9.
- D10, D28: Workers Cache API + KV invalidation → replaced by ND3, ND4.
- D13: CF Secrets Store → replaced by ND11 (`apps/server/src/lib/vault`).
- D18, D19, D24, D29, D38: CF Workers / CF Access specifics → replaced by ND6, ND7.
- D35: Direct Drizzle inserts in admin worker → kept in spirit (admin-server uses `tenantOperations`).
- D45, D46, D50, D51, D59, D62, D63, D66, D74, D75: Worker-architecture mechanics, ported transparently.

## Open questions surfaced during design

1. **Drizzle 1.0 stable timing.** RC.1 is out (April 2026). If 1.0 stable lands before Phase A starts, we adopt and use `defineRelations` v2 throughout. Otherwise we lock Phase A on 0.45.x and queue a Phase D migration task.
2. **Better Auth `enforce_sso` shape.** Org plugin has no native flag — we add it as a custom additional field with a `databaseHooks.session.create.before` enforcement hook. Confirm the hook order doesn't conflict with the auto-link rule (BA SSO plugin's `organizationProvisioning.getRole`).
3. **DNS provider for wildcard DNS-01.** Documented default: Cloudflare DNS (uses `caddy-dns/cloudflare` plugin). Pluggable via env-driven Caddyfile fragment — any plugin in the Caddy-DNS family works. Confirm which one ships in the deploy image baseline.
4. **`apps/web` lifecycle.** Spec assumes rename to `apps/app` and a new `apps/admin-ui`. The alternative (keep `apps/web` as-is and only add `apps/admin-ui`) is documented in [11-gotchas.md](./11-gotchas.md); pick before B3 starts.
5. **Pomerium vs in-app role gate as the production default.** Default ships as in-app role gate; documented Pomerium opt-in. Re-evaluate after operator count exceeds ~25 — at that scale a dedicated IAP starts paying for itself.

## Self-review against 2026 currency

Every section in this spec was cross-checked against current 2026 sources during a parallel-subagent web-research pass on 2026-05-11. Citation URLs live inline in each section. Notable currency findings:

- **Caddy `permission http`** replaces `ask` (Caddy 2.10+); the two are alternatives, not stackable. Caddy admin API exposes no cert-revoke DELETE — revocation is OCSP-driven or done by deleting the cert key from cluster storage.
- **MinIO OSS is archived** (Feb 2026). RustFS is alpha. SeaweedFS is the 2026 production default for S3-compatible OSS.
- **Better Auth 1.6.9** has no `enforce_sso` on the organization plugin; admin-plugin user creation bypasses `databaseHooks.user.create.before` (BA issue #3389).
- **Drizzle 1.0-RC.1** is current; production projects pin 0.45.x unless they want RC churn.
- **Hono 4.12.18** with `@hono/zod-openapi 1.3.0`. Pin `@hono/node-server ^1.19.13` and `hono ^4.12.4` for CVE-2026-39406 and CVE-2026-29045.
- **Vite 8** ships Rolldown by default (March 2026).
- **shadcn CLI v4** `--monorepo` flag with `registry:base` and `@workspace/ui` imports.
- **Storybook 10.x** with `@storybook/addon-vitest` (legacy `@storybook/test-runner` deprecated).
- **TypeScript 7.0 Beta** ships `tsgo` for `--noEmit`; `tsc` still required for emit until stable (June/July 2026).

## Observability contract

Every section honors the existing OTel setup at `apps/server/src/lib/otel-config.ts`:

- **`@hono/otel` `httpInstrumentationMiddleware` MUST be the first registered middleware** so AsyncLocalStorage establishes `trace_id`/`span_id` for downstream loggers. Misordering produces empty trace IDs — the #1 reported 2026 issue in `@hono/otel`.
- First middleware mints `X-Request-Id` if missing.
- Tenant-resolution logs include `requestId`, `host`, parsed kind, cache hit/miss, `organizationId`.
- Custom-hostname lifecycle logs include `requestId` (or Hatchet `workflow_run_id`), `hostnameId`, `lifecycleStatus`, `reconciliationAction`.
- Every response carries `X-Request-Id`.

## Plan integrity

- [x] All 12 spec docs present.
- [x] No emojis.
- [x] No `any`. No non-null assertions. All boundary casts annotated with `// boundary: <reason>`.
- [x] Cross-doc type names consistent (`Tenant`, `TenantNotFound`, `TenantSuspended`, `Invalidator`, `FanOutInvalidator`, `customHostnameLifecycle`, `tenantOperations`, `OPERATOR_PERMISSIONS`, `OperatorAction`, `withDecryptedSecret`, `verifyTenantJwt`).
- [x] Schema migration order (08) matches the schema-delta call sites in 02/03/04/05/06.
- [x] Citations to 2026 sources inline at every section that names a library version or API.
