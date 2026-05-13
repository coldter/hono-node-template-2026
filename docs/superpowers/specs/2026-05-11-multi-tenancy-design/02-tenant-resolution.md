# 02 — Tenant Resolution

## Package: `@repo/tenancy`

Single owner of host parsing, tenant resolution, cache keying, and cross-process invalidation. Every `apps/server` request runs through `tenantMiddleware()` before any business logic. `apps/admin-server` does NOT mount it.

### File structure

| Path | Responsibility |
|---|---|
| `packages/tenancy/package.json` | Workspace `@repo/tenancy`, depends on `@repo/db`, `@repo/shared`, `drizzle-orm`, `hono`, `lru-cache`, `pg` (peer) |
| `packages/tenancy/src/host-config.ts` | `HostConfig` type + `loadHostConfigOnce(env)` — snapshot, immutable after boot |
| `packages/tenancy/src/parse-hostname.ts` | Pure `parseHostname(host, config) → ParsedHost` discriminated union |
| `packages/tenancy/src/types.ts` | `Tenant`, `TenantNotFound`, `TenantSuspended`, `TenantResolution`, `TenancyEnv` |
| `packages/tenancy/src/cache.ts` | Two-tier cache: per-process `LRUCache<string, CachedShape>` keyed by `${version}:${canonicalHost}` |
| `packages/tenancy/src/resolve-tenant.ts` | `resolveTenant(host, deps) → TenantResolution` orchestration |
| `packages/tenancy/src/invalidator.ts` | `Invalidator` interface + `createInvalidator(deps)` — `bumpVersion(host?)` + `clearLocal(host?)` |
| `packages/tenancy/src/fan-out-invalidator.ts` | `FanOutInvalidator` — extends `Invalidator`; on `bumpVersion` also `hatchet.events.push("tenancy.invalidate", { host })` after commit |
| `packages/tenancy/src/hatchet-subscriber.ts` | `createTenantInvalidationSubscriber(hatchet, lru)` — registers a Hatchet workflow on `tenancy.invalidate`, drops local LRU on each event |
| `packages/tenancy/src/middleware.ts` | `tenantMiddleware(deps)` Hono middleware |
| `packages/tenancy/src/host-header-guard.ts` | Structural fail-closed — reject any request whose `Host` doesn't parse |
| `packages/tenancy/src/dev-header.ts` | Two-factor `X-Dev-Tenant-Slug` gate (env-gated + non-production) |
| `packages/tenancy/src/index.ts` | Public surface |

## Host parsing

`parseHostname(rawHost, config)` returns:

```ts
type ParsedHost =
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; host: string }
  | { kind: "admin" }
  | { kind: "fallback" }
  | { kind: "rejected"; reason: ParseRejectReason };

type ParseRejectReason =
  | "empty"
  | "invalid_chars"
  | "punycode"
  | "nested_subdomain"
  | "slug_format";
```

Algorithm (port of worker plan A2):
1. Strip port and trailing dot, NFC-normalize, lowercase.
2. Reject empty.
3. Reject any character outside `[a-z0-9.-]`.
4. If exactly `config.adminHost` → `{ kind: "admin" }`.
5. If exactly `config.fallbackHost` → `{ kind: "fallback" }`.
6. If ends with `config.wildcardSuffix`:
   - Any label starting with `xn--` → `rejected: "punycode"` (ASCII slugs only by policy).
   - Strip suffix → `slug`. If `slug` contains `.` → `rejected: "nested_subdomain"`.
   - Apply `SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/`. Fail → `rejected: "slug_format"`.
   - Otherwise → `{ kind: "subdomain", slug }`.
7. Otherwise `{ kind: "custom", host: normalized }` — punycode allowed for IDN tenant apexes.

`BUILTIN_RESERVED_SLUGS` (port of worker plan A2): `admin`, `auth`, `api`, `app`, `assets`, `cdn`, `console`, `dashboard`, `docs`, `internal`, `login`, `logout`, `ops`, `operator`, `platform`, `register`, `root`, `signup`, `static`, `status`, `support`, `system`, `www`. Complemented by DB-backed `reserved_slugs` table for tombstones + per-deploy denylist.

## Resolution flow

1. `tenantMiddleware` extracts `Host` (rejected if absent).
2. In `NODE_ENV !== "production"` AND `ALLOW_DEV_TENANT_HEADER=1`, read optional `X-Dev-Tenant-Slug` and rewrite the resolution host to `${slug}${config.wildcardSuffix}`.
3. `parseHostname(host, config)` — admin/fallback/rejected → `not_found`.
4. Canonical host: subdomain → `${slug}${wildcardSuffix}`, custom → normalized host.
5. Read version: per-process variable refreshed when the Hatchet `tenancy.invalidate` subscriber fires; cold start initializes from `SELECT version FROM tenant_cache_version LIMIT 1`.
6. LRU lookup by `${version}:${canonicalHost}` — return cached `found | not_found | suspended` if hit.
7. Cache miss → DB lookup:
   - Subdomain: `liveOrganizations.selectBySlug({ id, enforceSSO, sessionVersion, suspendedAt, deletedAt }, slug)`.
   - Custom: join through `tenant_custom_hostnames WHERE hostname=$1 AND lifecycle_status='active'` with `organizations` LIVE.
8. Build `Tenant` or `TenantNotFound` / `TenantSuspended`. Write to LRU with TTL (positive 60s, negative 5s).
9. Set `c.var.tenant = result`. For `suspended`, return 503 with `Retry-After: 60`. For `not_found`, return 404.

## Two-tier cache (`lru-cache@11`)

```ts
import { LRUCache } from "lru-cache";
const cache = new LRUCache<string, CachedShape>({
  max: 10_000,
  ttl: 60_000,                  // positive TTL default
  ttlAutopurge: false,
  allowStale: false,
});
```

Negative entries are inserted with explicit `cache.set(key, value, { ttl: 5_000 })`. `lru-cache@11`'s `.fetch()` is reserved for future SWR semantics — for now we keep set/get explicit so cache-miss latency is observable. https://www.npmjs.com/package/lru-cache

## Cross-process invalidation: Hatchet events

Why Hatchet (decision **ND3**):
- 2–5 Node processes is the target scale.
- Hatchet is already in the compose stack and every process already runs a Hatchet worker — adding another transport (Postgres LISTEN/NOTIFY or Redis pub/sub) just for invalidation is YAGNI.
- Hatchet event publish is best-effort by design, but the per-tenant cache-version key in Postgres (`tenant_cache_version` row) is the source of truth: every cache miss reads it, so a lost event is recovered within one positive-TTL window (60s).
- Hatchet observability surfaces invalidation traffic in the same dashboard as the rest of the workflow runs.

Mechanics:
- Each invalidating write (tenant suspension, hostname activation, slug rename) executes in a Postgres transaction that bumps `tenant_cache_version.version` and then, AFTER commit, `await hatchet.events.push("tenancy.invalidate", { host })`.
- If the post-commit publish fails, the version-key bump is still durable — the next cache miss in any process sees a new version and the LRU entry under the old version key is effectively dead.
- Every process registers a Hatchet workflow `on: { event: "tenancy.invalidate" }` whose task clears its local LRU and re-reads the version key on next request.
- Payload is JSON `{ host?: string; event?: "bump_all" }`. Hatchet allows multi-KB payloads, but we keep ours small.

Alternative (Postgres LISTEN/NOTIFY) is documented in [11-gotchas.md](./11-gotchas.md) — pick it only if you can't run Hatchet (Hatchet-free deployments). It has stronger transactional semantics but adds a second pub/sub transport.

## Tenancy propagation to services

There is no Postgres session variable for tenant identity. After resolution, `tenantMiddleware` sets `c.var.tenant` on the Hono context; downstream handlers and services read `tenant.organizationId` and pass it into every tenant-scoped repository call. Each repository bakes `eq(<table>.organizationId, organizationId)` into its WHERE clauses (canonical example: `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo). The `@repo/db` package exposes `liveOrganizations(executor)` as the sanctioned read seam for the `organizations` table itself; a structural CI test in `packages/db/__tests__/live-organizations.spec.ts` rejects any direct `from(organizations)` callsite outside a documented ALLOWLIST.

Cross-tenant isolation is asserted at the SERVICE layer: each tenant-scoped repository ships an integration test (run inside testcontainers `postgres:18-alpine`) that calls the repository with `organizationId=A` and asserts the result contains zero rows belonging to `organizationId=B`. See [12-testing-and-local-dev.md](./12-testing-and-local-dev.md) and [09-security.md](./09-security.md).

## API: `c.var.tenant`

```ts
declare module "hono" {
  interface ContextVariableMap {
    tenant: Tenant | null;
  }
}
```

Downstream code reads `const tenant = c.var.tenant; if (!tenant) throw ...`. The middleware guarantees that a request that reaches a route handler either has a non-null tenant or has already short-circuited with 404/503.

## Test matrix

`packages/tenancy/__tests__/`:
- `parse-hostname.test.ts` — every row in the parse table: empty, port-stripping, trailing-dot, NFC, `xn--` on wildcard (reject), `xn--` on custom (accept), reserved-slug match, nested subdomain, slug regex edges (single char, max length 63, leading/trailing hyphen, etc.).
- `cache.test.ts` — positive TTL, negative TTL, version-key invalidation drops everything, eviction at `max`.
- `resolve-tenant.test.ts` — integration with real Postgres + testcontainers. Subdomain hit, custom-host hit, suspended, deleted, not-found.
- `invalidator.test.ts` — `bumpVersion` issues `NOTIFY`; subscriber clears LRU.
- `listener.test.ts` — multi-process: process A bumps, process B's LRU clears within 50ms.
- `middleware.test.ts` — 200 on valid host, 404 on unknown, 503 on suspended, dev-header path gated correctly.
- `host-header-guard.test.ts` — 400 on missing/unparseable Host before any other middleware runs.
- `dev-header.test.ts` — `NODE_ENV=production` ignores the header regardless of `ALLOW_DEV_TENANT_HEADER`.

## Sources

- `lru-cache@11`: https://www.npmjs.com/package/lru-cache · https://isaacs.github.io/node-lru-cache/
- Postgres LISTEN/NOTIFY caching pattern (2026): https://oneuptime.com/blog/post/2026-03-31-redis-how-to-sync-redis-cache-with-postgresql-changes/view
- `pg.Client` LISTEN best practices: https://node-postgres.com/apis/client (long-lived client, not pool-borrowed)
