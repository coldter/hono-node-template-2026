# 01 — Architecture

## Production topology

```
                       ┌──────────────────────────────────────────────────┐
                       │ Caddy 2.11.2 (reverse proxy + ACME + on-demand)  │
                       │  - wildcard: *.app.example.com via DNS-01        │
                       │    (caddy-dns/cloudflare or pluggable)           │
                       │  - on-demand TLS for custom hostnames            │
                       │    gated by `permission http` → /caddy/ask       │
                       │  - cluster storage: pberkel/caddy-storage-redis  │
                       │  - apex page at app.example.com (static)         │
                       └──────────────────────────────────────────────────┘
                                          │
              ┌───────────────────────────┼──────────────────────────────┐
              │                           │                              │
              ▼                           ▼                              ▼
     ┌────────────────┐         ┌────────────────┐            ┌─────────────────┐
     │  apps/server   │         │ apps/admin-srv │            │  static SPAs    │
     │  Hono on Node  │         │  Hono on Node  │            │  apps/admin-ui  │
     │  tenant edge   │         │  operator edge │            │  apps/app       │
     │  + BA 1.6.9    │         │  + global_admin│            │  served by      │
     │  + tenancy mw  │         │  + tenant ops  │            │  Caddy fs       │
     │  + caddy/ask   │         │                │            │                 │
     │  + Hatchet wf  │         │                │            │                 │
     └────────────────┘         └────────────────┘            └─────────────────┘
              │                           │
              └───────────────┬───────────┘
                              ▼
                ┌─────────────────────────────────────┐
                │ Postgres 18 + Redis 8 + Hatchet     │
                │ + S3 (SeaweedFS prod / RustFS dev)  │
                │ + Vault (envelope KEK)              │
                └─────────────────────────────────────┘
```

## Host map (single source of truth)

The host map is loaded once at process boot from environment variables and held as an immutable snapshot inside `@repo/tenancy` (`HostConfig`). Mutation requires a restart.

| Host | Routed to | Notes |
|---|---|---|
| `app.example.com` | static landing/find-your-team page | Served by Caddy directly. No app process touches this host. |
| `{slug}.app.example.com` | `apps/server` → tenant SPA (`apps/app/dist/`) + `/api/*` | DNS-01 wildcard cert. Tenant resolution by slug. |
| `<custom-host>` | `apps/server` → tenant SPA + `/api/*` | On-demand TLS gated by `/caddy/ask`. Tenant resolution by joined `tenant_custom_hostnames`. |
| `admin.example.com` | `apps/admin-server` → admin SPA (`apps/admin-ui/dist/`) + `/api/*` | Per-tenant DNS-01 cert. Operator perimeter gates inbound. |
| `auth.<branding>` paths | not separate — co-located in `apps/server` | The worker plan's `apps/auth` worker is in-process here; sanitization still happens at the BA boundary. |

## Process layout

### `apps/server` (tenant edge)

Owns: tenant API, Better Auth handlers (multi-tenant), custom-hostname provisioning + verification, Caddy `ask` endpoint, branding upload + serve, Hatchet workflows including the 60s reconciler. Serves tenant SPA static assets via Hono `serveStatic` (`@hono/node-server`) or — recommended — Caddy `file_server` reading `apps/app/dist/`.

Middleware order (load-bearing):
1. `httpInstrumentationMiddleware` — OTel/AsyncLocalStorage context; MUST be first or trace IDs drop.
2. Request-ID middleware (cuid; accept inbound `X-Request-Id` only if it parses).
3. `hostHeaderGuard` from `@repo/tenancy` — reject if `Host` is missing or unparseable.
4. CORS for the per-tenant origin only.
5. Rate limit (existing `globalRateLimitMW`, scoped per resolved tenant once known).
6. `tenantMiddleware()` — sets `c.var.tenant` for downstream services to scope by `tenant.organizationId` (no Postgres session var).
7. Audit / auth context.
8. Routes.
9. `onError` / `notFound` final handlers.

### `apps/admin-server` (operator edge)

Owns: operator authentication, `global_admins` management, tenant CRUD (`tenantOperations`), SSO provider CRUD, custom-hostname admin views, support endpoints.

Middleware order:
1. `httpInstrumentationMiddleware` — first.
2. Request-ID middleware.
3. `hostHeaderGuard` — must be `ADMIN_HOST` only.
4. `operatorPerimeter` — branches on `ADMIN_PERIMETER` env (see [05-admin-panel.md](./05-admin-panel.md)).
5. `authenticateOperator` — resolves `global_admins` row from BA session OR proxy headers.
6. `requireOperator(action)` per-route.
7. Routes.

The admin server **never** runs `tenantMiddleware()`; it operates with system actor identity, bounded by `requireOperator` policy.

## OSS substitution table (locked)

| Worker concept | Node port | Where |
|---|---|---|
| 5 CF Workers (`server`, `auth`, `admin`, `admin-ui`, `app`) | 2 Node procs + 2 SPAs | `apps/server`, `apps/admin-server`, `apps/admin-ui`, `apps/app` |
| `packages/ui` (Radix + Tailwind preset + Storybook) | Same, via shadcn CLI v4 `--monorepo` | `packages/ui` |
| CF for SaaS custom hostnames + TXT DCV + 7-state lifecycle | **Caddy 2.11.2 on-demand TLS + `permission http`** + Hatchet reconciler + 6-state lifecycle (drop `pre_validation`) | `apps/server/src/modules/tenancy/`, `deploy/Caddyfile.prod` |
| Wildcard subdomain cert | Caddy **DNS-01 wildcard** via env-pluggable plugin (default `caddy-dns/cloudflare`) | `deploy/Caddyfile.prod` |
| Workers Cache API per-isolate | `lru-cache@11` in-process with `.fetch()` SWR | `@repo/tenancy/src/cache.ts` |
| KV cache-version key | Postgres `tenant_cache_version` row (durable) + Hatchet event `tenancy.invalidate` (fan-out) | `@repo/tenancy/src/invalidator.ts` |
| Cross-worker service-binding RPC fan-out | **Hatchet events** (`tenancy.invalidate`); Postgres LISTEN/NOTIFY documented as fallback | `@repo/tenancy/src/hatchet-subscriber.ts` |
| `waitUntil(p)` | `@repo/shared/wait-until.ts` — bounded SIGTERM await | `packages/shared/src/wait-until.ts` |
| Cloudflare Access perimeter | **Env-flagged**: in-app `global_admins` (default) OR **Pomerium** front (opt-in) | `apps/admin-server/src/middlewares/operator-perimeter.ts` |
| R2 branding assets | S3 API via `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`; **SeaweedFS** prod / **RustFS** dev | `apps/server/src/modules/tenancy/branding-storage.ts` |
| `triggers.crons` 60s reconciler | Hatchet `on: { cron: "* * * * *" }` | `apps/server/src/workflows/reconcile-hostnames.ts` |
| CF Secrets Store | `apps/server/src/lib/vault` (already abstracts `local | aws-kms | gcp-kms | azure-keyvault`) — envelope KEK | unchanged path |
| `workers_dev: false` + host-header guard | `hostHeaderGuard` middleware, structural fail-closed | `@repo/tenancy/src/middleware.ts` |
| Service-binding RPC parameter passing for `tenant` (D11) | In-process Hono context variable (`c.var.tenant`) | `@repo/tenancy/src/middleware.ts` |

## Sources

- Caddy 2.11.2 release: https://github.com/caddyserver/caddy/releases
- Caddy on-demand TLS + `permission http`: https://caddyserver.com/docs/automatic-https
- `pberkel/caddy-storage-redis`: https://github.com/pberkel/caddy-storage-redis
- Postgres LISTEN/NOTIFY for cache invalidation, 2026 small-fleet pattern: https://oneuptime.com/blog/post/2026-03-31-redis-how-to-sync-redis-cache-with-postgresql-changes/view
- SeaweedFS vs MinIO (archived) vs RustFS (alpha): https://rilavek.com/resources/self-hosted-s3-compatible-object-storage-2026
- Pomerium vs oauth2-proxy multi-tenant: https://www.pomerium.com/blog/best-oauth2-proxy-alternative
- `@hono/otel` middleware ordering: https://www.technetexperts.com/hono-otel-pino-trace-id-fix/
- Bun 1.3 workspaces: https://bun.com/docs/pm/workspaces
- Hono 4.12 + `@hono/node-server 1.19.13` (CVE-2026-39406): https://advisories.gitlab.com/pkg/npm/@hono/node-server/CVE-2026-39406/
