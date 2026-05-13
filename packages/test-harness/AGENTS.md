# @repo/test-harness

Test-only fixtures for the multi-tenant API: tenant seeding, a fake OIDC
IdP, and a Caddy-ask stub. Lives in the workspace so contract tests
across apps and packages can share a single canonical seed seam.

## Boundary

**Production code MUST NOT import from `@repo/test-harness`.**

This is enforced by a Biome `noRestrictedImports` rule in the repo-root
`biome.json` covering:

- `apps/server/src/!(__tests__)/**`
- `apps/admin-server/src/!(__tests__)/**` (when it exists)
- `packages/!(test-harness)/src/!(__tests__)/**`

Test paths (`__tests__/**`, `*.test.ts`, `*.spec.ts`) and the
`packages/test-harness` package itself are exempt.

Run `bun run check` to enforce the rule locally; CI catches violations
via the same biome target.

## Public exports

| Symbol | Source |
|---|---|
| `seedTenant`, `SeedTenantInput`, `TenantSeed` | `src/seed-tenant.ts` |
| `createFakeIdp`, `FakeIdp`, `FakeIdpOptions` | `src/oidc/fake-idp.ts` |
| `startCaddyStub`, `CaddyStub`, `CaddyStubOptions`, `CaddyAskResult` | `src/caddy-stub/run.ts` |

## `seedTenant`

Inserts an organization (idempotent on slug), optionally seeds a
custom hostname row in `lifecycle_status = "active"`, and bumps the
tenant cache version. Used by the `seed:dev` CLI and contract tests.

The custom-hostname insert intentionally bypasses the lifecycle state
machine (`applyTransition` in `apps/server/src/modules/tenancy/`); the
harness is the seed boundary, so reaching across the workspace into
`apps/` would invert the dependency graph. Lifecycle transitions get
their own coverage in the service-layer tests.

## Fake OIDC IdP

Hono + `jose` implementation (not `oidc-provider`) — keeps the
dependency footprint inside libs already used by this monorepo. Covers
discovery, JWKS, `/authorize` auto-approve, and `/token` exchange.
Extend (or swap to `oidc-provider`) when A7.7's contract tests need
PKCE, refresh, or userinfo.

## Caddy-ask stub

Polls the server-under-test's `/caddy/ask?domain=...` endpoint for
each provided domain. Collects status + body so callers can assert
the contract.

## Rules

- No `any`, no non-null assertions, no emojis.
- `unknown` / `as unknown as T` only at validated boundaries; annotate
  with `// boundary: <reason>`.
- All exports get explicit return types.
