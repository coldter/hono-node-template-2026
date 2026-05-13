# B1 — `apps/admin-server` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up `apps/admin-server` — a separate Hono on Node process serving `admin.example.com`, gated by either the in-app `global_admin` role or a Pomerium OIDC proxy (env-flagged).

**Architecture:** Mirrors `apps/server` layout but does NOT run `tenantMiddleware`. Operator perimeter middleware is env-flagged; both modes feed `c.var.operator`.

**Tech Stack:** Hono `^4.12.18`, `@hono/node-server` `^2.0.2`, `@hono/zod-openapi` `^1.4.0`, `@hono/otel` `^1.1.2`, Better Auth `^1.6.10` (in_app mode), Pomerium 0.30+ (oidc_proxy mode).

**References:** spec § 05; decisions D18, D20, D26, D31, ND6, ND7.

> **Pattern inheritance**: this admin-server consumes `packages/hono-app` (extracted in B1.0) for its chain machinery and `RequestContext<TPrincipal>` envelope. Both `apps/server` and `apps/admin-server` are now adapters at the same seam. The admin envelope uses `principal: { kind: "operator"; operator: { id, subRole, email } } | null` (the discriminated `Principal` shape that aligns with tenant-server's `principal: { kind: "tenant-user"; user; session } | null`). `liveOrganizations` + `generateIdForModel` + `bumpTenantCacheVersion` apply.

---

## Task B1.0: Extract `packages/hono-app` (precondition for B1.1)

**Files:**
- Create: `packages/hono-app/package.json`
- Create: `packages/hono-app/tsconfig.json`
- Create: `packages/hono-app/src/chain.ts`
- Create: `packages/hono-app/src/context.ts` (generic `RequestContext<TPrincipal>` envelope)
- Create: `packages/hono-app/src/middlewares/request-context-init.ts`
- Create: `packages/hono-app/src/middlewares/otel.ts`
- Create: `packages/hono-app/src/middlewares/audit-context.ts`
- Create: `packages/hono-app/src/boot.ts` (the `bootHonoApp` runner)
- Create: `packages/hono-app/src/index.ts` (re-exports)
- Modify: `apps/server/src/chain.ts` — becomes a consumer of `packages/hono-app`'s primitives plus project-specific entries.
- Modify: `apps/server/src/lib/context.ts` — re-exports / specialises the generic envelope with the tenant-user principal.
- Modify: `apps/server/src/server.ts` — uses `bootHonoApp`.
- Modify: `apps/server/src/middlewares/{request-context-init,otel,audit-context}.ts` — re-export from package or delete in favour of direct imports.

> **Rationale:** B1.1 onward would otherwise duplicate ~7 files from `apps/server/src/` (`chain.ts`, `server.ts`, `middlewares/{request-context-init,otel,audit-context}.ts`, `lib/context.ts`). Two adapters at the same seam = real seam — extract the chain machinery, the generic `RequestContext<TPrincipal>` envelope, and the `bootHonoApp` runner into a workspace package now so both apps consume the same primitives.

- [ ] **Step 1: Failing test** — `apps/server` test suite continues to pass after migration to consume `packages/hono-app`. Add a small package-level test asserting `bootHonoApp({ entries, principalFactory })` mounts middlewares in `requires` order and that `RequestContext<TPrincipal>` typechecks for both tenant and operator principals.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — lift `chain.ts`, the three middlewares, the envelope, and the boot runner. Make `RequestContext` generic over `TPrincipal`. Keep project-specific entries (e.g. `tenantMiddleware`, BA proxy) in `apps/server`.

- [ ] **Step 4: Run, watch pass; lint + check; self-review.**

## Task B1.1: Scaffold `apps/admin-server`

**Files:**
- Create: `apps/admin-server/package.json`
- Create: `apps/admin-server/tsconfig.json`
- Create: `apps/admin-server/src/index.ts`
- Create: `apps/admin-server/src/server.ts`
- Create: `apps/admin-server/src/env.ts`
- Create: `apps/admin-server/AGENTS.md`

- [ ] **Step 1: Failing test** — boot the admin-server process and hit `GET /healthz` to confirm it starts.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** the scaffold mirroring `apps/server` minus tenancy middleware. `env.ts` adds `PORT=3100`, `ADMIN_HOST`, `ADMIN_PERIMETER` (`in_app` | `oidc_proxy`), `OPERATOR_HMAC_KEY`.

- [ ] **Step 4: Run, watch pass; lint + check; self-review.**

## Task B1.2: `hostHeaderGuard` for admin host only

**Files:**
- Create: `apps/admin-server/src/middlewares/host-header-guard.ts`
- Test: `apps/admin-server/src/__tests__/host-header-guard.test.ts`

- [ ] **Step 1: Failing test** — non-`ADMIN_HOST` returns 400.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — reuse `@repo/tenancy`'s `hostHeaderGuard` if signature fits, or write a thin local one that asserts equality with `env.ADMIN_HOST`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.3a: Extract `createAuthBase(deps)` (precondition for B1.3)

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts` (or create sibling `apps/server/src/modules/auth/auth-base.ts`) — introduce `createAuthBase(deps)` returning a base `BetterAuthOptions` builder.
- Modify: `apps/server/src/modules/auth/instance.ts` — `createAuth(tenantDeps)` (tenant) composes SSO plugin + host policy + tenant-specific options on top of the base.

> **Rationale:** Tenant and operator BA instances differ only on `disableSignUp`, SSO plugin presence, and host policy. Everything else (drizzle adapter, ID gen, password hash, 2FA OTP, admin plugin) is identical. Without a shared base, BA upgrades drift between the two. Keep both factories co-located under `apps/server/src/modules/auth/` until B1 proves the split needs `@repo/auth-core`.

- [ ] **Step 1: Failing test** — assert `createAuth(tenantDeps)` and a stub `createAdminAuth(operatorDeps)` both produce BA instances whose shared options (adapter, ID gen, password hash, 2FA OTP) reference the same dep-injected functions.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — refactor existing `createAuth` to delegate to `createAuthBase(deps)`; existing `apps/server` tests must still pass unchanged.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.3: `operator-perimeter.ts` — `in_app` mode

**Files:**
- Create: `apps/admin-server/src/middlewares/operator-perimeter.ts`
- Create: `apps/admin-server/src/modules/auth/instance.ts` (operator BA instance — `createAdminAuth(operatorDeps)` composing on top of `createAuthBase`)
- Test: `apps/admin-server/src/__tests__/operator-perimeter.in_app.test.ts`

> **Note:** Tenant and operator instances share password hashing (`apps/server/src/modules/auth/helpers/argon2id.ts`), `generateIdForModel`, and the 2FA OTP email template. These are dep-injected through `createAuthBase`, not copied.

- [ ] **Step 1: Failing test**

```ts
it("401 without operator session", async () => { /* hit a protected route */ });
it("403 with session whose user lacks a global_admins row", async () => { /* ... */ });
it("200 + c.var.requestContext.principal.kind === 'operator' set with valid operator", async () => { /* ... */ });
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

Wire BA in `apps/admin-server/src/modules/auth/instance.ts` as `createAdminAuth(operatorDeps)` — composes on top of `createAuthBase(deps)` from B1.3a with `disableSignUp: true`, no SSO plugin, `jwt({ expirationTime: "15m" })`. The middleware reads BA session, looks up `global_admins` by `user_id`, and sets `c.var.requestContext.principal = { kind: "operator", operator: { id, subRole, email } }`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.4: `operator-perimeter.ts` — `oidc_proxy` mode (Pomerium)

**Files:**
- Modify: `apps/admin-server/src/middlewares/operator-perimeter.ts`
- Test: `apps/admin-server/src/__tests__/operator-perimeter.oidc_proxy.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("401 when X-Forwarded-By-Trusted-Proxy HMAC is missing", async () => { /* ... */ });
it("401 when HMAC fails verification", async () => { /* ... */ });
it("JIT-creates read_only global_admins row on first hit", async () => { /* ... */ });
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — env branch on `ADMIN_PERIMETER`. HMAC-verify `X-Forwarded-By-Trusted-Proxy` using `OPERATOR_HMAC_KEY`. Read `X-Auth-Request-Email`; JIT-create row if absent with `sub_role='read_only'`. Update `last_login_at`.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
function verifyHmac(sig: string, key: string): boolean {
  // sig format: "<timestamp>:<hex>" where hex = HMAC-SHA256(timestamp)
  const [ts, hex] = sig.split(":");
  if (!ts || !hex) return false;
  const expected = createHmac("sha256", key).update(ts).digest("hex");
  try { return timingSafeEqual(Buffer.from(hex, "hex"), Buffer.from(expected, "hex")); }
  catch { return false; }
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.5: `requireOperator(action)` middleware factory

**Files:**
- Create: `apps/admin-server/src/middlewares/require-operator.ts` (thin ~6-line wrapper around `assertPermitted` from `@repo/authorization`).
- Create: `packages/authorization/src/operator-policy.ts` (NEW — single home for the matrix data, Drizzle predicate factory, and framework-agnostic predicate). Exports:
  - `OPERATOR_PERMISSIONS` — the matrix data.
  - `whereGlobalAdminRole(executor)` — Drizzle predicate factory.
  - `assertPermitted(principal, action): null | AuthFailure` — framework-agnostic.
- Test: `apps/admin-server/src/__tests__/require-operator.test.ts`

> **Rationale:** All three artifacts (`OPERATOR_PERMISSIONS`, the Drizzle predicate, and the Hono guard) answer the same question — "can this operator do X?". Consolidate the data + policy into one file inside `@repo/authorization`; the Hono middleware becomes a 6-line wrapper. Two existing adapters today (DB predicate + HTTP guard); a future RPC client makes three.

- [ ] **Step 1: Failing test**

```ts
it("read_only operator is blocked from tenant.suspend", async () => { /* ... */ });
it("platform_admin operator is allowed tenant.suspend", async () => { /* ... */ });
it("denial writes a CRITICAL audit row", async () => { /* ... */ });
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** `packages/authorization/src/operator-policy.ts` (matrix from spec § 05 + `whereGlobalAdminRole` + `assertPermitted`); `apps/admin-server/src/middlewares/require-operator.ts` is a thin wrapper that calls `assertPermitted` and emits the CRITICAL audit on deny.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.6: Tenant CRUD endpoints (skeleton — full service in C5)

**Files:**
- Create: `apps/admin-server/src/modules/tenants/routes.ts`
- Create: `apps/admin-server/src/modules/tenants/handlers.ts`
- Test: `apps/admin-server/src/modules/tenants/__tests__/routes.test.ts`

- [ ] **Step 1: Failing test** — POST `/api/tenants`, GET list, POST suspend, POST restore. Each requires the correct `OperatorAction`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — direct Drizzle inserts for create; calls into `suspendTenant` from A6.5 for suspend; analogous `restoreTenant` for restore.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.7: OpenAPI export

**Files:**
- Modify: `apps/admin-server/src/server.ts` (mount `OpenAPIHono.doc()`)
- Test: `apps/admin-server/src/__tests__/openapi.test.ts`

- [ ] **Step 1: Failing test** — `GET /api/openapi.json` returns a valid OpenAPI 3.1 doc that includes all admin routes.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — `app.doc("/api/openapi.json", { openapi: "3.1.0", info: { title: "admin-server" } })`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B1.8: Compose integration + Caddy host wiring

**Files:**
- Modify: `compose.yaml`
- Modify: `deploy/Caddyfile.prod`
- Modify: `deploy/Caddyfile.dev`

- [ ] **Step 1: Failing test** — `docker compose up -d apps-admin-server` brings the service up; `curl https://admin.localhost/healthz` returns 200 through Caddy.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — add service definition, env wiring, Caddy routing for `admin.example.com` / `admin.localhost`.

- [ ] **Step 4: Self-review**

## Task B1.9: Stateless operator session JWT verification helper

**Files:**
- Create: `apps/admin-server/src/lib/operator-jwt.ts`
- Test: `apps/admin-server/src/lib/__tests__/operator-jwt.test.ts`

- [ ] **Step 1: Failing test** — verify a freshly-minted operator JWT; reject one with bad signature / expired / wrong `aud`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** using `jose` against the BA `jwks` plugin endpoint.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Exit criteria

- [ ] `apps/admin-server` boots, serves `/healthz` through Caddy on `admin.<host>`.
- [ ] `in_app` mode authenticates via BA + `global_admins` row.
- [ ] `oidc_proxy` mode verifies the `X-Forwarded-By-Trusted-Proxy` HMAC and JIT-creates a `read_only` row.
- [ ] `requireOperator(action)` enforces the full `OPERATOR_PERMISSIONS` matrix.
- [ ] Tenant CRUD endpoints respond and audit-log every mutation.
- [ ] OpenAPI doc served at `/api/openapi.json`.
