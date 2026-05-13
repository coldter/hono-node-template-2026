# A7 — Local-Dev Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Provide a self-contained dev experience: `bun run setup:env`, `bun run check:hosts`, `bun run seed:dev`, Caddyfile.dev with `tls internal`, `*.localhost` resolution, and `X-Dev-Tenant-Slug` two-factor gate documented + working.

**Architecture:** A handful of scripts under `scripts/`, a dev Caddyfile, additions to `compose.yaml`, and contract tests that exercise the full tenant resolution path locally.

**Tech Stack:** Bun `1.3.12` scripts, Caddy `2.11.2`, Postgres `18.3`, Redis, Hatchet (`@hatchet-dev/typescript-sdk@^1.22.1`).

**References:** spec § 12; decisions D46, D59.

> **Conventions inherited from A1–A6:**
> - Caddy split is already in place: `deploy/Caddyfile.prod` (A5.8) for production with on-demand TLS. The pre-multi-tenant `deploy/Caddyfile.simple` is template-era and gets deleted in A7.4.
> - All seeds use `liveOrganizations` for idempotency checks and `generateIdForModel` for IDs.
> - `apps/server/src/middlewares/tenant-bridge.ts` already mirrors `c.var.tenant` into `requestContext.tenant`; the dev-header adapter must register through `chain.ts` (inline, not as a separate file — see A7.4).
> - `packages/tenancy/src/dev-header.ts::resolveDevTenantHeader` is the two-factor gate; do NOT re-implement.
> - All test fixtures (fake OIDC IdP, caddy-ask stub, `seedTenant` helper, request-context builders) live in `@repo/test-harness` (new workspace package at `packages/test-harness/`). A Knip rule forbids production code (`apps/server/src/!(__tests__)/**`, `apps/admin-server/...`, `packages/!(test-harness)/src/**`) from importing from `@repo/test-harness`. The package is dev-deps only.
> - Future state-machine modules (operator enrollment in B2; any tenant-cache eviction policies) cargo-cult the file shape from `apps/server/src/modules/tenancy/lifecycle.ts` — single-writer + `TRANSITIONS` constant + discriminated `Transition` union — but do NOT extract a generic `applyTransition<TState>` primitive. Three nearly-identical files are leverage on cognition; a generic primitive would fight each adapter's domain shape.

---

## Task A7.0: `@repo/test-harness` workspace setup

**Files:**
- Create: `packages/test-harness/package.json` (private, dev-deps only)
- Create: `packages/test-harness/tsconfig.json`
- Create: `packages/test-harness/src/index.ts` (barrel)
- Create: `packages/test-harness/src/seed-tenant.ts`
- Modify: `package.json` (root workspaces — already includes `packages/*`, just confirm)
- Modify: Knip config — forbid production code from importing `@repo/test-harness` (rule scope: `apps/server/src/!(__tests__)/**`, `apps/admin-server/...`, `packages/!(test-harness)/src/**`).

- [ ] **Step 1: Failing test** — `seedTenant({ db, slug: "acme" })` is idempotent (second call returns the same tenant, no duplicate row); when `withCustomHost: "app.acme.localhost"` is passed, the custom-hostname row reaches `active` via `applyTransition` and `bumpTenantCacheVersion(tx)` is invoked.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — ship `seedTenant({ db, slug, withCustomHost?, sessionVersion? }): Promise<TenantSeed>`. Used by:
  - A7.3 `seed:dev` (the CLI wraps this helper).
  - A7.5/A7.6/A7.7/A7.8 contract tests (call directly inside `withTestServer` or equivalent).
  - Future B1 admin-server tests.

  Two adapters today (CLI + contract tests) = a real seam, not speculative.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A7.0b: Split env schema from parsed singleton

**Files:**
- Create: `apps/server/src/env-schema.ts` (pure Zod schema; no side effects)
- Modify: `apps/server/src/env.ts` (re-export schema + parse-on-import + `process.exit` on failure)
- Modify: callers — `scripts/setup-env.ts` (A7.1), tests, and any other place that imports `envSchema` for shape inspection switches to `env-schema.ts`. `env.ts` is reserved for the parsed singleton.

- [ ] **Step 1: Failing test** — importing `env-schema.ts` in a process with deliberately broken `process.env` does NOT exit; importing `env.ts` does. Asserts the side effect is isolated to the singleton module.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — move the Zod schema (including the cross-host `.refine()` rules added in A7.2) into `env-schema.ts`. `env.ts` imports the schema, calls `.parse(process.env)`, and exposes the parsed singleton; on failure it logs and `process.exit(1)`. This refactor is small but high-leverage: codegen and any boundary-validation site can import the schema without triggering boot validation against the caller's env.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A7.1: `bun run setup:env`

**Files:**
- Create: `scripts/setup-env.ts`
- Modify: `package.json` (root, add script)
- Create: `.env.example` (root)
- Test: `scripts/__tests__/setup-env.test.ts`

- [ ] **Step 1: Failing test** — given a root `.env.example` with `APP_WILDCARD_HOST=app.localhost`, `setup-env` writes `apps/server/.env` and `apps/admin-server/.env` with the same value plus per-app keys (PORT etc.).

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — source the env-key shapes from the live Zod schema in `apps/server/src/env-schema.ts` (pure schema, no side effects — see A7.0b); do not hand-enumerate. Gate the admin-server target on `existsSync('apps/admin-server')`; that app lands in B1.

Required for boot: `BRANDING_HOST`, `CORS_ORIGIN`, `BETTER_AUTH_SECRET`, `REDIS_URL` (A6.3).

```ts
// scripts/setup-env.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { serverEnvSchema } from "../apps/server/src/env-schema";
// derive the allowed key set from the Zod schema, then partition per target app.
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A7.2: Cross-host collision rules in `envSchema`

**Files:**
- Modify: `apps/server/src/env-schema.ts` (add `.refine()` rules; see A7.0b)
- Modify: `package.json` (root) — `bun run check:hosts` either disappears or becomes an alias for `bun --filter server check-types` (env validation runs at parse time, so boot covers it for free).
- Test: `apps/server/src/__tests__/env-schema.test.ts` (assert each refine fires on a colliding fixture)

No standalone `scripts/check-hosts.ts` ships — the checks live in the Zod schema so the server boots safely without an extra CI step.

- [ ] **Step 1: Failing test** — for each rule, provide a fixture env that violates it and assert `envSchema.safeParse(env).success === false` with a stable error path/message:
  - `APP_WILDCARD_HOST !== ADMIN_HOST` (defense in depth at parse time; `loadHostConfig` already throws — keep that throw, it's the seam other consumers reach for).
  - `BRANDING_HOST` does not collide with `APP_WILDCARD_HOST` (neither apex nor wildcard match).
  - `CUSTOM_HOST_CNAME_TARGET` does not collide with `APP_WILDCARD_HOST` (not under the wildcard, not equal to admin).
  - `FALLBACK_HOST` does not collide with any of the above.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — add `.refine()` calls to `envSchema` alongside the existing HATCHET/VAULT/FCM refinements. Do NOT remove the throw inside `loadHostConfig` — it's the library-side defense for non-server consumers.

```ts
// apps/server/src/env-schema.ts (excerpt)
envSchema
  .refine((e) => e.APP_WILDCARD_HOST !== e.ADMIN_HOST, {
    message: "APP_WILDCARD_HOST and ADMIN_HOST must differ",
    path: ["ADMIN_HOST"],
  })
  .refine(/* BRANDING_HOST vs APP_WILDCARD_HOST */)
  .refine(/* CUSTOM_HOST_CNAME_TARGET vs APP_WILDCARD_HOST */)
  .refine(/* FALLBACK_HOST vs all of the above */);
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A7.3: `bun run seed:dev`

**Files:**
- Create: `apps/server/scripts/seeds/dev/seed.ts`
- Modify: `apps/server/scripts/seeds/index.ts` (register the dev seed in the existing runner)
- Modify: `package.json` (root)
- Test: `apps/server/scripts/seeds/dev/__tests__/seed.test.ts`

- [ ] **Step 1: Failing test** — after `seed:dev`, an `acme` org exists with a verified user `dev@example.com` (password `dev`), and optionally a `app.acme.localhost` active custom-hostname row.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — the CLI is a thin wrapper around `seedTenant` from `@repo/test-harness` (A7.0). The helper centralises `liveOrganizations(db).existsBySlug → insert → applyTransition → bumpTenantCacheVersion`; the CLI adds user-creation + password-hash on top.

  - Idempotency via `liveOrganizations(db).existsBySlug("acme")` inside the helper.
  - ID via `generateIdForModel("organization")` inside the helper.
  - Password via `apps/server/src/modules/auth/helpers/argon2id.ts::hashPassword`.
  - Custom-hostname seed routes through `apps/server/src/modules/tenancy/lifecycle.ts::applyTransition` (do NOT insert `lifecycle_status: 'active'` directly).

```ts
// apps/server/scripts/seeds/dev/seed.ts
import { users } from "@repo/db";
import { hashPassword } from "@/modules/auth/helpers/argon2id";
import { seedTenant } from "@repo/test-harness";
// 1. const tenant = await seedTenant({ db, slug: "acme", withCustomHost: process.env.SEED_CUSTOM === "1" ? "app.acme.localhost" : undefined });
// 2. insert dev@example.com user with hashPassword("dev")
// (seedTenant handles existsBySlug guard, generateIdForModel, applyTransition, and bumpTenantCacheVersion.)
```

`seedTenant` invokes `bumpTenantCacheVersion(tx)` from `@repo/db` so a long-lived dev server picks up the new tenant.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

> **Operator seed:** deferred to B2.1 (full implementation alongside the operator-enrollment flow). Phase A does NOT ship a `seed:operator` skeleton — skeletons with no implementation are dead code.

## Task A7.4: `Caddyfile.dev` + compose wiring

A5.8 already produced `Caddyfile.prod`. A7.4 adds `Caddyfile.dev` (service `caddy-dev` under `profiles: ["dev"]`) and deletes the pre-multi-tenant `deploy/Caddyfile.simple`. Dev uses `tls internal` — local CA can issue any subdomain; no need for the on-demand permission gate.

**Files:**
- Create: `deploy/Caddyfile.dev`
- Delete: `deploy/Caddyfile.simple` (template-era, no consumers — verify no `README.md` / `AGENTS.md` references it; remove any that exist).
- Modify: `compose.yaml`
- Test: `deploy/__tests__/caddyfile-dev.test.ts` (lints via `caddy adapt`)

- [ ] **Step 1: Failing test** — `caddy adapt --config deploy/Caddyfile.dev` returns 0 and the parsed JSON includes `tls.automation.policies.[0].issuers.[0].module == "internal"`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```caddyfile
{
    local_certs
}
*.app.localhost {
    tls internal
    reverse_proxy host.docker.internal:3000
}
admin.localhost {
    tls internal
    reverse_proxy host.docker.internal:3100
}
app.localhost {
    tls internal
    respond "Find your team at https://&lt;slug&gt;.app.localhost"
}
```

Add to `compose.yaml`:
```yaml
caddy-dev:
  image: caddy:2.11.2
  profiles: ["dev"]
  cap_add: [NET_BIND_SERVICE]
  ports: ["80:80","443:443","2019:2019"]
  volumes:
    - ./deploy/Caddyfile.dev:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
```

Inline the Hono adapter directly in `chain.ts`'s entry list (a `kind: "use"` `ChainEntry` with a 12-line inline `MiddlewareHandler` that delegates to `resolveDevTenantHeader` from `@repo/tenancy`). Do NOT create `apps/server/src/middlewares/dev-tenant-header.ts`. Gate at chain-build time on `env.ALLOW_DEV_TENANT_HEADER === "1"` so the entry isn't even constructed in production. If a second caller (CLI debug tool, integration helper) ever materialises, extract then.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A7.5: Tenant-resolution contract tests

**Files:**
- Create: `apps/server/src/__tests__/contract/tenant-resolution.test.ts`

- [ ] **Step 1: Failing test** — exercise the full matrix from spec § 02 against the running test server (testcontainers Postgres + Redis). Assert via `c.var.requestContext.tenant`, not `c.var.tenant`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** the tests; no production code change.

- [ ] **Step 4: Run, watch pass; lint + check; self-review.**

## Task A7.6: Sanitized auth-proxy contract tests

**Files:**
- Create: `apps/server/src/__tests__/contract/sanitized-auth-proxy.test.ts`

- [ ] **Step 1: Failing test** — issue a poisoned request, assert BA-derived `baseURL` ignores the poison.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — tests only.

- [ ] **Step 4: Lint + check, self-review.**

## Task A7.7: SSO contract tests against a fake OIDC IdP

**Files:**
- Create: `packages/test-harness/src/oidc/fake-idp.ts` (using `oidc-provider` — pin the version; exported from the `@repo/test-harness` barrel)
- Create: `apps/server/src/__tests__/contract/sso-flow.test.ts`

- [ ] **Step 1: Failing test** — fake IdP issues a code; server exchanges it; user is logged in via SSO; auto-link rule honored. Add a tombstoned-org case asserting SSO auto-link refuses to bind into a soft-deleted org.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — boilerplate `oidc-provider` setup.

- [ ] **Step 4: Lint + check, self-review.**

## Task A7.8: Custom-hostname Caddy-stub contract tests

**Files:**
- Create: `packages/test-harness/src/caddy-stub/run.ts` (sends `GET /caddy/ask?domain=...`; exported from the `@repo/test-harness` barrel)
- Create: `apps/server/src/__tests__/contract/caddy-ask.test.ts`

- [ ] **Step 1: Failing test** — drive `/caddy/ask` through the stub for the full status matrix, including the 429 rate-limit case (`caddyAskRateLimit`); verify the lazy `awaiting_caddy → active` flip on next `tenantMiddleware` hit. The flip goes through `lifecycle.ts::applyTransition`, not an ad-hoc UPDATE.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — stub + tests.

- [ ] **Step 4: Lint + check, self-review.**

## Exit criteria

- [ ] `bun run setup:env` and `bun run seed:dev` work from a clean clone. Host-collision checks live in `envSchema` `.refine()` rules (A7.2) so boot validation covers them — no standalone `check:hosts` script ships. `seed:operator` is NOT a Phase A deliverable (deferred to B2.1).
- [ ] `Tenant.sessionVersion` projected via `resolveTenant`.
- [ ] `deploy/Caddyfile.dev` adapts cleanly; `tls internal` issues valid certs after `caddy trust`.
- [ ] Contract tests cover tenant resolution, sanitized auth proxy, SSO flow, and Caddy `ask` (including 429).
- [ ] Hatchet-driven cache invalidation works after `seed:dev`.
- [ ] Phase A merges yield a deployable single-tenant-shaped multi-tenant API.
