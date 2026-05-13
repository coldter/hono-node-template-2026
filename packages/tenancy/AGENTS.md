# @repo/tenancy

Tenant resolution, caching, invalidation, and Hono middleware for the multi-tenant API.

## Package purpose

- **Host parsing** — validates incoming hostnames against slug/custom-host patterns.
- **Two-tier cache** — in-process LRU (lru-cache@11) backed by a lazy Postgres-LISTEN subscriber; avoids a DB round-trip on every request.
- **Hatchet-event invalidation** — `createFanOutInvalidator` pushes cache-busting events through the Hatchet workflow bus.
- **Hono middleware** — `tenantMiddleware` resolves the tenant from `c.req.header("host")` and sets `c.var.tenant`; `hostHeaderGuard` rejects requests with no or malformed host header before routing.

## Tenant isolation model

Isolation is enforced **in TypeScript** at the repository and service layers via `c.var.tenant.organizationId` gating.

This package does **not** set a Postgres session variable (`app.current_tenant`, `SET LOCAL`, etc.) and there is no RLS or session-var helper here. There is no `withTenantSessionVar`, no `rls-context.ts`, no `app.current_tenant`. The middleware sets `c.var.tenant` and that is it — downstream code is responsible for scoping queries.

## Public exports (re-exported from `src/index.ts`)

| Symbol | Module |
|---|---|
| `parseHostname`, `SLUG_RE`, `BUILTIN_RESERVED_SLUGS` | `src/parse-hostname.ts` |
| `loadHostConfig`, type `HostConfig` | `src/host-config.ts` |
| `createTenancyCache`, type `TenancyCache` | `src/cache.ts` |
| `resolveTenant`, type `Tenant`, `TenantNotFound`, `TenantSuspended`, `TenantResolution`, `CachedShape` | `src/resolve-tenant.ts`, `src/types.ts` |
| `createFanOutInvalidator`, types `HatchetEventBus`, `Invalidator` | `src/fan-out-invalidator.ts` |
| `createTenantInvalidationSubscriber`, type `HatchetWorkflowBus` | `src/hatchet-subscriber.ts` |
| `tenantMiddleware` | `src/middleware.ts` |
| `hostHeaderGuard` | `src/host-header-guard.ts` |
| `resolveDevTenantHeader`, type `DevHeaderResult` | `src/dev-header.ts` |

## Tests

All tests are behavioral — no tautological scaffold-export assertions.

- Unit tests live in `src/__tests__/`.
- Integration tests use Testcontainers (`postgres:18-alpine`) and are introduced by plan tasks A2.5 and A2.6.
- Run: `bun run test` (or `vitest run`) from this package directory.

## Key rules

- No `any`, no non-null assertions (`!`), no emojis.
- `unknown` / `as unknown as T` only at validated boundaries (Zod parse, typeof guard, vendor-SDK variance). Annotate with `// boundary: <reason>`.
- All functions must have explicit return types.
