# 12 — Testing and Local-Dev

## Test stack (May 2026)

| Concern | Tool | Pin | Notes |
|---|---|---|---|
| Runner | Vitest | `^4.1.x` | Browser Mode stable; install `@vitest/browser-playwright` separately |
| Postgres for integration tests | `@testcontainers/postgresql` | latest | Image `postgres:18-alpine` (NOT `postgis/postgis:18` unless we actually need PostGIS) |
| Redis for integration tests | `@testcontainers/redis` | latest | Only required for the `jti` kill-list integration tests; tenancy invalidation rides Hatchet events |
| Mock Redis for pure unit tests | `ioredis-mock` | latest | OK for unit tests; for command-fidelity use the testcontainer |
| Browser tests | Vitest Browser Mode + Playwright provider | matches Vitest | https://vitest.dev/blog/vitest-4.html |
| OIDC IdP for SSO contract tests | `oidc-provider` | latest | Local fake IdP under `local-harness/oidc/` |
| Caddy contract harness | `local-harness/caddy-stub/` | n/a | Sends `GET /caddy/ask?domain=...` and asserts our handler matrix |
| Test DB lifecycle | One container per Vitest worker + `CREATE DATABASE test_${uuid}` per test file | n/a | Enable container reuse locally, disable in CI |

Sources: https://node.testcontainers.org/modules/postgresql/ · https://github.com/testcontainers/testcontainers-node/releases · https://viglucci.io/articles/testing-redis-with-testcontainers-node

## Test invariants

- **No DB mocking in integration tests.** Real Postgres via testcontainers. Matches existing AGENTS.md rule.
- **Pure unit tests** (parse-hostname, JWT verification math, slug regex) MAY use `ioredis-mock` + the in-memory Drizzle adapter.
- **Cross-tenant isolation characterization tests run at the SERVICE layer**, inside testcontainers `postgres:18-alpine`. For each tenant-scoped repository (e.g. `ssoProviderRepository`, `customHostnameLifecycle`, `auditLogService`), the test seeds rows for two organizations `A` and `B`, calls the repository with `organizationId=A`, and asserts the returned rows are entirely from `A` (zero rows belong to `B`). Canonical scoping pattern: `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo. The structural test at `packages/db/__tests__/live-organizations.spec.ts` covers the `organizations` table itself.
- **`@hono/otel` middleware-order test** asserts the instrumentation middleware was registered before any business middleware (introspect the Hono app's `routes` array).

## Local-dev DX targets (end of Phase A)

By the end of Phase A, a fresh clone + `bun install` should support:

| Command | Effect |
|---|---|
| `bun run setup:env` | Materialize per-app `.env` files from a single root `.env` |
| `bun run check:hosts` | Verify `APP_WILDCARD_HOST`, `ADMIN_HOST`, `FALLBACK_HOST` don't collide |
| `bun run seed:dev` | Provision baseline tenant `acme` + optional active local custom hostname |
| `bun run seed:operator` | Provision a `global_admins` enrollment-token row + print token |
| (external) `bun dev` | Caddy + Postgres + Redis + Hatchet running via compose; apps via bun watch |

## Local DNS

Two viable approaches, both encoded in `compose.yaml` and `deploy/Caddyfile.dev`:

### Approach A: `*.localhost` (RFC 6761) — RECOMMENDED

`*.app.localhost` resolves to `127.0.0.1` on macOS, Linux, Windows 11+ per RFC 6761. No external service.

```env
APP_WILDCARD_HOST=app.localhost
ADMIN_HOST=admin.localhost
FALLBACK_HOST=app.localhost
```

Caddy `Caddyfile.dev`:
```caddyfile
{
    local_certs
}
*.app.localhost {
    tls internal
    reverse_proxy apps-server:3000
}
admin.localhost {
    tls internal
    reverse_proxy apps-admin-server:3100
}
```

### Approach B: `lvh.me` (public DNS wildcard)

`*.lvh.me` resolves to `127.0.0.1` via public DNS. Useful if you need to test from a non-host device on the same network (mobile sim).

Both are documented; `*.localhost` is the default. Source: https://datatracker.ietf.org/doc/html/rfc6761

## Dev TLS

`caddy trust` installs Caddy's local CA into the system trust store. `tls internal` (Caddy 2.11.x) issues certs from that CA on the fly. No mkcert needed. Prefer mkcert only if non-Caddy tooling (curl from a Lambda emulator, native mobile sim, etc.) also needs trust.

Caddy invocation in compose:
```yaml
caddy:
  image: caddy:2.11.2
  cap_add: [NET_BIND_SERVICE]
  ports: ["80:80","443:443"]
  volumes:
    - ./deploy/Caddyfile.dev:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
  command: ["caddy","run","--config","/etc/caddy/Caddyfile","--adapter","caddyfile"]
```

`caddy_data` persists the local CA between restarts so a one-time `caddy trust` works across the dev cycle.

## Dev-tenant header

Fast curl testing without a full subdomain setup:

```bash
ALLOW_DEV_TENANT_HEADER=1 bun run dev
curl -H "X-Dev-Tenant-Slug: acme" http://app.localhost:3000/api/tenancy/current
```

Gated by:
- `ALLOW_DEV_TENANT_HEADER=1` env.
- `NODE_ENV !== "production"`.
- Inbound slug passes `SLUG_RE` AND is not in `BUILTIN_RESERVED_SLUGS`.

If any gate fails the header is ignored and a `tenant.dev_header.ignored` log is emitted. In production the header is structurally ignored regardless of env (defense in depth — `parseHostname` is the only authority).

## Contract tests (Phase A exit criteria)

`apps/server/src/__tests__/contract/`:
- `tenant-resolution.test.ts` — full parse-hostname matrix table.
- `sanitized-auth-proxy.test.ts` — every stripped header asserted absent.
- `request-id.test.ts` — inbound `X-Request-Id` accepted iff valid cuid; else minted.
- `caddy-ask.test.ts` — handler-state matrix (200/404 by lifecycle status).
- `txt-verification.test.ts` — DoH success/NXDOMAIN/timeout/mismatch.
- `custom-hostname-reconciler.test.ts` — Hatchet workflow state transitions.
- `tenant-isolation.test.ts` — per-repository service-layer isolation: `organizationId=A` returns zero `B` rows for each tenant-scoped repository (`ssoProviderRepository`, `customHostnameLifecycle`, `auditLogService`, etc.); plus a `live-organizations` structural-grep regression that mirrors `packages/db/__tests__/live-organizations.spec.ts`.
- `listen-notify.test.ts` — two-process cache-drop within 50ms.
- `jwt-revocation.test.ts` — sessionVersion + jti + URL-form invariants.

`apps/admin-server/src/__tests__/contract/`:
- `host-header-guard.test.ts`.
- `operator-perimeter.in_app.test.ts` and `operator-perimeter.oidc_proxy.test.ts`.
- `enroll-token.test.ts`.

## Compose additions (decision summary)

```yaml
services:
  caddy:
    image: caddy:2.11.2
    # see above

  rustfs:                                # local S3-API; alpha but adequate
    image: ghcr.io/rustfs/rustfs:latest
    ports: ["9000:9000","9001:9001"]
    environment:
      RUSTFS_ACCESS_KEY: minioadmin
      RUSTFS_SECRET_KEY: minioadmin
    volumes: [rustfs_data:/data]

  pomerium:                              # OPTIONAL — admin perimeter opt-in
    image: pomerium/pomerium:latest
    profiles: ["oidc_proxy"]
    volumes: ["./deploy/pomerium.yaml:/pomerium/config.yaml:ro"]
    # not enabled by default; `docker compose --profile oidc_proxy up`
```

`pomerium` lives under a compose profile so the default `docker compose up` doesn't start it. Set `ADMIN_PERIMETER=oidc_proxy` AND start with `--profile oidc_proxy` to activate.

## CI matrix

Each PR runs:
- `bun run check` (Biome + tsgo `--noEmit`).
- `bun run test --filter <changed packages>` (with testcontainers).
- `bun run test:contracts` (full contract suite if any of `@repo/tenancy`, `apps/server`, `apps/admin-server`, `@repo/auth-tokens` changed).
- Knip dead-code check.
- Cross-tenant isolation characterization tests.

Phase A exit gate adds a manual smoke test against a real Let's Encrypt staging cert (Caddy `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory`).
