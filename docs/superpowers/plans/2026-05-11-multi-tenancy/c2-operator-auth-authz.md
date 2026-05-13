# C2 — Operator Auth/Authz Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Consolidate the operator auth/authz flow in `apps/admin-server` behind clean abstractions. One operator-policy module (`@repo/authorization/src/operator-policy.ts`) owns the matrix + DB predicate + framework-agnostic predicate; `authenticateOperator` returns a discriminated `AuthFailure`; `requireOperator(action)` is a thin Hono wrapper; JWKS cache verifies stateless operator sessions.

**Tech Stack:** `@repo/authorization` extensions, `@repo/auth-tokens` (C1), `jose`.

**References:** spec § 05; decisions D52, D55, D69, D71, D72.

---

## Task C2.1: One operator-policy module in `@repo/authorization`

**Files:**
- Create: `packages/authorization/src/operator-policy.ts` — single home for all three artifacts:
  - `OPERATOR_PERMISSIONS` — the matrix data.
  - `whereGlobalAdminRole(executor)` — Drizzle predicate factory.
  - `assertPermitted(principal, action): null | AuthFailure` — framework-agnostic predicate.
- Modify: `packages/authorization/src/index.ts` — re-export the three names plus the `OperatorAction` / `GlobalAdminSubRole` types.
- Test: `packages/authorization/__tests__/operator-policy.test.ts`

> **Rationale:** Matrix constants, the Drizzle predicate, and the Hono guard all answer the same question — "can this operator do X?". Co-locate them so the data and the policy live together; framework adapters (Hono middleware in B1.5, a future RPC client) stay thin wrappers around `assertPermitted`. Today: two adapters (DB predicate + HTTP guard). Tomorrow: three.

- [ ] **Step 1: Failing test** — `OperatorAction` derived from keys; each entry has at least one allowed sub-role. `whereGlobalAdminRole("platform_admin","support")` returns a Drizzle predicate that filters `global_admins.sub_role` accordingly. `assertPermitted({ kind: "operator", operator: { subRole: "read_only", ... } }, "tenant.suspend")` returns `{ kind: "forbidden", action: "tenant.suspend" }`; the same call with `platform_admin` returns `null`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** the spec's full matrix verbatim plus the predicates.

```ts
import { inArray } from "drizzle-orm";
import { globalAdmins } from "@repo/db/schema";

export const OPERATOR_PERMISSIONS = { /* per spec § 05 */ } as const satisfies Record<string, ReadonlyArray<"platform_admin"|"support"|"read_only">>;
export type OperatorAction = keyof typeof OPERATOR_PERMISSIONS;
export type GlobalAdminSubRole = (typeof OPERATOR_PERMISSIONS)[OperatorAction][number];

export const whereGlobalAdminRole = (...subRoles: ReadonlyArray<GlobalAdminSubRole>) =>
  inArray(globalAdmins.subRole, [...subRoles]);

export const assertPermitted = (
  principal: Principal,
  action: OperatorAction,
): null | AuthFailure => { /* matrix lookup */ };
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C2.2: (merged into C2.1) `whereGlobalAdminRole` lives in `operator-policy.ts`

> The previously-separate `where-global-admin-role.ts` is consolidated into `packages/authorization/src/operator-policy.ts` (see C2.1). No standalone task.

## Task C2.3: `AuthFailure` discriminated union + `authenticateOperator`

**Files:**
- Modify: `apps/admin-server/src/middlewares/authenticate-operator.ts`
- Test: `apps/admin-server/src/__tests__/authenticate-operator.test.ts`

- [ ] **Step 1: Failing test**

```ts
type AuthFailure =
  | { kind: "unauthenticated" }
  | { kind: "not_global_admin"; email: string }
  | { kind: "perimeter_invalid"; reason: string }
  | { kind: "session_expired" };

it.each([
  ["no cookie + no headers", { kind: "unauthenticated" }],
  ["valid session, missing global_admins row", { kind: "not_global_admin", email: "x@y" }],
  ["expired session", { kind: "session_expired" }],
])("returns %s → %j", async (label, expected) => { /* drive each case */ });
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** with full discriminated-union return; the middleware sets `c.var.requestContext.principal = { kind: "operator", operator: { id, subRole, email } }` on success or sets `c.var.authFailure` for `requireOperator` to surface.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C2.4: `JwksCache` integration for stateless operator sessions

**Files:**
- Modify: `apps/admin-server/src/lib/operator-jwt.ts`
- Test: `apps/admin-server/src/lib/__tests__/operator-jwt.cache.test.ts`

- [ ] **Step 1: Failing test** — first verify fetches JWKS; second within TTL hits the cache; key rotation triggers re-fetch.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** by re-using `@repo/auth-tokens` `JwksCache`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C2.5: `requireOperator(action)` middleware factory (final shape)

**Files:**
- Modify: `apps/admin-server/src/middlewares/require-operator.ts`
- Test: `apps/admin-server/src/__tests__/require-operator.matrix.test.ts`

- [ ] **Step 1: Failing test** — full matrix from spec § 05 OPERATOR_PERMISSIONS: each (action, sub_role) cell asserted.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — `requireOperator(action)` is a thin (~6-line) Hono adapter that calls `assertPermitted(principal, action)` from `@repo/authorization/src/operator-policy.ts`; on non-null failure, emit CRITICAL audit and return the discriminated response. Type-narrow `OperatorAction` parameter via `keyof typeof OPERATOR_PERMISSIONS`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C2.6: Cleanup — remove inline role checks across admin handlers

**Files:**
- Modify: every `apps/admin-server/src/modules/*/routes.ts`
- Test: characterization tests stay green

- [ ] **Step 1: Audit** every handler for inline `op.sub_role === ...` checks; replace with `requireOperator("...")` middleware on the route.

- [ ] **Step 2: Run characterization tests + lint**

- [ ] **Step 3: Self-review**

## Exit criteria

- [ ] `OPERATOR_PERMISSIONS`, `whereGlobalAdminRole`, and `assertPermitted` all live in `packages/authorization/src/operator-policy.ts` — the only place where role-action mapping is encoded.
- [ ] `OperatorAction` type comes from the matrix (`keyof typeof OPERATOR_PERMISSIONS`).
- [ ] `authenticateOperator` returns a discriminated `AuthFailure`; no inline `c.json(..., 401)` paths.
- [ ] `requireOperator(action)` is a thin Hono adapter around `assertPermitted`.
- [ ] JWKS cache rotates within TTL.
- [ ] Every admin route is gated by `requireOperator(...)`.
