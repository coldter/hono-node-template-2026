# A6 — Layered JWT + Session Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire BA `jwt` plugin to mint short-lived (15min) per-tenant JWTs with URL-form `aud`/`iss`, an `org` claim including `sessionVersion`, and a `jti`. Implement the per-tenant session-revoke flow (`sessionVersion` bump + BA session deletion + post-commit Hatchet `tenancy.invalidate` event) and the `jti` Redis short-list.

**Architecture:** BA mints, our `@repo/auth-tokens` (Phase C) verifies. In Phase A we land the mint side + suspension flow only.

**Tech Stack:** Better Auth `^1.6.10` `jwt` plugin, Redis 8, `@repo/db`.

**References:** spec § 03 § Layered revocation; decisions D12, D34, ND10.

> **Precondition:** A4.7 (tenant-scope `findById(id, organizationId)` security fix on `sso-storage.ts`) has landed.

> **Conventions (this plan inherits the post-deepening codebase):**
> - All BA hook bodies extracted to top-level exports (cf. `runSessionCreateBefore`).
> - All org reads via `liveOrganizations(db|tx).selectById/...`.
> - All cache-version writes via `bumpTenantCacheVersion(tx)` from `@repo/db`.
> - All IDs via `generateIdForModel(model)`.
> - Drizzle migrations generate-only.
> - `lifecycle.ts` single-writer state-machine pattern (cf. `apps/server/src/modules/tenancy/lifecycle.ts` for custom hostnames) is the template for org-status transitions.
> - Exhaustive switch with `biome-ignore` for unreachable defaults; no `any`/`!`.
> - All hook tests follow `superpowers:test-driven-development` (Step 1-5 below are not repeated per task).

---

## Task A6.0: Project `sessionVersion` onto the `Tenant` type

**Files:**
- Modify: `packages/tenancy/src/types.ts` — add `sessionVersion: number` to `Tenant`.
- Modify: `packages/tenancy/src/resolve-tenant.ts` — project `organizations.session_version` in the SQL so the resolved tenant carries the version.

This precondition unlocks A6.1 (payload reads `tenant.sessionVersion`) and A6.5 (suspend bumps it).

---

## Task A6.1: Canonical `TenantJwtClaims` schema + builder (lives in `@repo/auth-tokens`)

**Schema source-of-truth:** The Zod schema for `TenantJwtClaims` and the `buildClaims(ctx, tenant)` builder MUST live in `packages/auth-tokens/src/claims.ts` (NEW file landed as part of A6.1). The mint side (`apps/server`) and the verify side (C1) import the same schema. Duplicate Zod schemas in `apps/server`, `apps/admin-server`, or downstream services are forbidden.

**Files:**
- Create: `packages/auth-tokens/src/claims.ts` — exports the `tenantJwtClaimsSchema` (Zod), the inferred `TenantJwtClaims` type, and `buildClaims(ctx, tenant): TenantJwtClaims | {}`.
- Modify: `apps/server/src/modules/auth/jwt-payload.ts` — collapses to a re-export wrapper: `export { buildClaims as buildTenantJwtPayload } from "@repo/auth-tokens/claims";`.
- Modify: `apps/server/package.json` — add `@repo/auth-tokens` workspace dep (the package scaffold of C1.1 is brought forward into A6.1 by necessity; see C1 preamble).
- Test: `packages/auth-tokens/src/__tests__/claims.test.ts` (schema round-trip + builder shape).
- Test: `apps/server/src/modules/auth/__tests__/jwt-payload.test.ts` (BA `definePayload` integration).

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import type { Tenant } from "@repo/tenancy";
import { buildTenantJwtPayload } from "../jwt-payload";

describe("buildTenantJwtPayload", () => {
  it("emits URL-form aud/iss + org claim + jti", () => {
    const tenant: Tenant = {
      organizationId: "o_1",
      host: "acme.app.example.com",
      slug: "acme",
      sessionVersion: 3,
      // ...other Tenant fields per packages/tenancy/src/types.ts
    } as Tenant;
    const payload = buildTenantJwtPayload({ user: { id: "u_1" } }, tenant);
    expect(payload.aud).toBe("https://acme.app.example.com");
    expect(payload.iss).toBe("https://acme.app.example.com");
    expect(payload.org).toEqual({ id: "o_1", host: "acme.app.example.com", slug: "acme", sessionVersion: 3 });
    expect(payload.jti).toMatch(/^[a-z0-9]+/);
  });
  it("returns {} when tenant is null", () => {
    expect(buildTenantJwtPayload({ user: { id: "u_1" } }, null)).toEqual({});
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — in `packages/auth-tokens/src/claims.ts`:
  - Define `tenantJwtClaimsSchema` with Zod: `sub` (optional string), `aud` (URL string), `iss` (URL string), `org` (object: `id`, `slug` nullable, `host`, `sessionVersion` number), `jti` (string).
  - Export the inferred `TenantJwtClaims` type via `z.infer`.
  - Export `buildClaims(ctx: unknown, tenant: Tenant | null): TenantJwtClaims | Record<string, never>` that narrows `ctx` at the BA boundary, returns `{}` when `tenant` is null, and otherwise emits URL-form `aud`/`iss`, the `org` claim, and a fresh `jti`.
  - `apps/server/src/modules/auth/jwt-payload.ts` reduces to a re-export: `export { buildClaims as buildTenantJwtPayload } from "@repo/auth-tokens/claims";`. BA's `jwt.definePayload` consumes the re-export.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A6.2: BA `jwt` plugin wiring with EdDSA

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts`
- Test: `apps/server/src/modules/auth/__tests__/jwt-mint.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { decodeJwt } from "jose";
import { signInAndFetchJwt } from "./helpers/sign-in";

describe("jwt mint", () => {
  it("contains org claim with sessionVersion", async () => {
    await seedOrgAndUser({ orgId: "o_1", slug: "acme", sessionVersion: 7, email: "a@b" });
    const token = await signInAndFetchJwt({ email: "a@b", host: "acme.app.example.com" });
    const payload = decodeJwt(token);
    expect(payload.org).toMatchObject({ id: "o_1", sessionVersion: 7 });
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — mutate the existing `jwt(...)` call in `instance.ts` to add `jwks: { keyPairConfig: { alg: 'EdDSA' } }`. Do NOT use `deps.tenant!` — keep nullable; `buildTenantJwtPayload` handles null.

```ts
import { jwt } from "better-auth/plugins";

// inside createAuth(...).plugins, modify the existing jwt() call:
jwt({
  jwks: { keyPairConfig: { alg: "EdDSA" } },
  jwt: {
    expirationTime: "15m",
    definePayload: (ctx) => buildTenantJwtPayload(ctx, deps.tenant),
  },
}),
```

Note: the test must use the testcontainers harness (BA's JWKS init touches the DB).

**Risk:** If BA 1.6.10's EdDSA support requires a `crv` field or doesn't ship JWKS for EdDSA out of the box, fall back to RS256 (spec § JWT explicitly allows it).

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A6.3: `JtiKillList` seam (two adapters: memory + Redis)

**Seam choice:** The `JtiKillList` interface is the public seam. The Redis client is a private implementation detail of the Redis-backed adapter — callers (logout flow, JWT verify) depend on `JtiKillList`, not on Redis. This satisfies the two-adapter rule (in-memory for tests + single-node dev; Redis for production) without exposing a `RedisClient` seam to non-kill-list callers. (A Redis client may still live in `apps/server/src/lib/redis/` for OTHER future uses — rate-limits, locks — but the kill-list does not depend on that being public.)

**Files:**
- Create: `apps/server/src/modules/auth/jti-kill-list.ts` — exports the `JtiKillList` type only.
- Create: `apps/server/src/modules/auth/jti-kill-list-memory.ts` — `inMemoryJtiKillList()` for tests + single-node dev. Uses a `Map<string, expiryEpochMs>` with `Date.now()`-based expiry.
- Create: `apps/server/src/modules/auth/jti-kill-list-redis.ts` — `redisJtiKillList(opts: { url: string })` constructs its own private `redis@^5` client. No `RedisClient` seam is exported.
- Test: `apps/server/src/modules/auth/__tests__/jti-kill-list-memory.test.ts`

- [ ] **Step 0: Add Redis dependency**

Add `redis@^5` (node-redis v5 — latest 2026) to `apps/server/package.json`. Add `REDIS_URL` to `apps/server/src/env.ts`. The Redis client construction happens INSIDE `jti-kill-list-redis.ts`; no public `lib/redis/client.ts` seam is required by this task. (If a separate `lib/redis/` runtime appears later for rate-limits/locks, that's an unrelated module.)

- [ ] **Step 1: Failing test** (behaviour-level, not Redis-key-level)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { inMemoryJtiKillList } from "../jti-kill-list-memory";

describe("jtiKillList (memory adapter)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("addKilled then isKilled returns true within TTL", async () => {
    const kl = inMemoryJtiKillList();
    await kl.addKilled("jti_x", 300);
    expect(await kl.isKilled("jti_x")).toBe(true);
    expect(await kl.isKilled("jti_y")).toBe(false);
  });

  it("isKilled returns false once TTL has elapsed", async () => {
    const kl = inMemoryJtiKillList();
    await kl.addKilled("jti_x", 300);
    vi.advanceTimersByTime(301_000);
    expect(await kl.isKilled("jti_x")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — `JtiKillList` interface, plus the two adapters.

```ts
// jti-kill-list.ts
export type JtiKillList = Readonly<{
  addKilled(jti: string, ttlSeconds: number): Promise<void>;
  isKilled(jti: string): Promise<boolean>;
}>;
```

The in-memory adapter is a `Map` with epoch-ms expiries; the Redis adapter constructs its own client from `opts.url`, namespaces keys with `jti:kill:`, uses `SET key 1 EX ttl` + `EXISTS key`. Neither leaks the underlying transport to callers.

- [ ] **Step 4: Production wiring** — `createAuth(deps)` accepts `deps.jtiKillList: JtiKillList`. Server bootstrap picks `redisJtiKillList({ url: env.REDIS_URL })`; tests pick `inMemoryJtiKillList()`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A6.4: `active-session-jwt.ts` — deep module owning mint→logout bridge

**Module purpose (single deep module):** one file owns the column pair `current_jti` + `current_jti_exp`, the mint-side stamp, AND the logout-side read with TTL math. `instance.ts` does not learn whether BA fires `jwt.onTokenIssued` vs. a custom plugin — that decision is encapsulated inside this module. `runSessionDeleteAfter` shrinks to two lines.

**Files:**
- Create: `apps/server/src/modules/auth/active-session-jwt.ts` — exports `activeSessionJwt(deps: { db, jtiKillList }): { stampHook: BetterAuthPlugin; recordMint(sessionId, jti, expEpochSec): Promise<void>; read(sessionId): Promise<{ jti: string; exp: number } | null>; revoke(sessionId, now?): Promise<void>; }`. The `stampHook` is the BA plugin/hook (resolved internally — `jwt.onTokenIssued` if available in 1.6.10, otherwise a custom plugin that wraps the mint call). The `revoke` method does `read` + `addKilled(jti, max(0, exp - now))` and is what logout calls.
- Create: `apps/server/src/modules/auth/logout-jti.ts` exporting `runSessionDeleteAfter(session, deps, helpers)` — top-level for unit testing, matches `runSessionCreateBefore` pattern. Body is two lines: `const active = await deps.activeSessionJwt.read(session.id); if (active) await deps.jtiKillList.addKilled(active.jti, remainingTtl(active.exp));` (or equivalently `await deps.activeSessionJwt.revoke(session.id);`).
- Test: `apps/server/src/modules/auth/__tests__/active-session-jwt.test.ts`
- Test: `apps/server/src/modules/auth/__tests__/logout-jti.test.ts`

**Schema change:** Add `current_jti TEXT` + `current_jti_exp TIMESTAMPTZ` columns to the `sessions` table (via `drizzle-kit generate` — never hand-author SQL). Schema-level comment MUST capture the rationale:

> `current_jti` + `current_jti_exp` exist solely to bridge mint→logout for the `jti` kill-list. If access-token TTL drops below acceptable revocation latency, this module + the two columns + the kill-list can be deleted together.

- [ ] **Step 1: Failing tests**
  - `recordMint` then `read` returns `{ jti, exp }`.
  - After mint, logout reads the active jti and adds it to the kill-list with TTL = `exp - now`, clamped to ≥ 0.
  - Logout when no active jti is recorded (e.g. cookie-only session) is a no-op and does not throw.
  - The hook never throws on Redis failure; failures are logged and swallowed (cf. `queueNewDeviceNotification` precedent).

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — the module decides internally whether to register `jwt.onTokenIssued` or a custom BA plugin; callers see only the `stampHook` value to pass into `createAuth({ plugins })`. `runSessionDeleteAfter` MUST NOT touch the `sessions` table directly — it goes through `activeSessionJwt.read`/`revoke`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A6.5: `organization-lifecycle.ts` — single-writer state machine (four arrows from day one)

**Module purpose:** ONE file owns every org status transition, mirrors `apps/server/src/modules/tenancy/lifecycle.ts` (the custom-hostname state machine — proven shape). Ships with the FULL `TRANSITIONS` table covering all four arrows. Audit + invalidator-bump live INSIDE the writer; handlers never repeat them. Phase A wires `create` and `suspend` arrows end-to-end (handlers exist or are stubbed by B1); `restore` and `softDelete` arrows are in the `TRANSITIONS` table and exercised by service-layer tests, but no HTTP route is wired in Phase A.

**TRANSITIONS table (full, lands in A6.5):**

| from         | to             | side effects                                                                                     | Phase A handler? |
|--------------|----------------|--------------------------------------------------------------------------------------------------|------------------|
| `null`       | `active`       | insert org row; audit `tenancy.org.created`; invalidator bump                                    | yes (create)     |
| `active`     | `suspended`    | set `suspendedAt`; bump `sessionVersion`; delete BA sessions; audit; invalidator bump            | yes (suspend)    |
| `suspended`  | `active`       | clear `suspendedAt`; **do NOT decrement `sessionVersion`**; audit `tenancy.org.restored`; bump   | service-only     |
| `active`     | `soft_deleted` | set `deletedAt`; insert `reserved_slugs (slug, reason='tombstone', organizationId)`; delete sessions; audit; bump | service-only |

**Files:**
- Create: `apps/server/src/modules/tenancy/organization-lifecycle.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/organization-lifecycle.test.ts` — one test per arrow.

- [ ] **Step 1: Failing tests** — one per arrow, all driven through `applyOrgTransition`:

```ts
import { describe, it, expect } from "vitest";
import { liveOrganizations, organizations, reservedSlugs } from "@repo/db";
import { applyOrgTransition } from "../organization-lifecycle";

describe("applyOrgTransition", () => {
  it("create: null → active inserts org, audits, bumps", async () => {
    const inv = makeFakeInvalidator();
    await applyOrgTransition(
      { slug: "acme", name: "Acme", actor: GA_ACTOR, host: "acme.app.example.com" },
      { kind: "create", data: { primaryAdminEmail: "a@b" } },
      { db, invalidator: inv },
    );
    expect(inv.bumpVersion).toHaveBeenCalledWith("acme.app.example.com");
  });

  it("suspend: active → suspended bumps sessionVersion + deletes sessions", async () => {
    await seedOrg({ id: "o_1", sessionVersion: 1, slug: "acme" });
    await seedSession({ id: "s_1", activeOrganizationId: "o_1" });
    const inv = makeFakeInvalidator();
    await applyOrgTransition(
      { orgId: "o_1", actor: GA_ACTOR, host: "acme.app.example.com" },
      { kind: "suspend" },
      { db, invalidator: inv },
    );
    const [row] = await liveOrganizations(db).selectById(
      { sessionVersion: organizations.sessionVersion, suspendedAt: organizations.suspendedAt }, "o_1",
    );
    expect(row?.sessionVersion).toBe(2);
    expect(row?.suspendedAt).not.toBeNull();
    expect(inv.bumpVersion).toHaveBeenCalled();
  });

  it("restore: suspended → active clears suspendedAt and does NOT decrement sessionVersion", async () => {
    await seedOrg({ id: "o_1", sessionVersion: 2, suspendedAt: new Date(), slug: "acme" });
    const inv = makeFakeInvalidator();
    await applyOrgTransition(
      { orgId: "o_1", actor: GA_ACTOR, host: "acme.app.example.com" },
      { kind: "restore" },
      { db, invalidator: inv },
    );
    const [row] = await liveOrganizations(db).selectById(
      { sessionVersion: organizations.sessionVersion, suspendedAt: organizations.suspendedAt }, "o_1",
    );
    expect(row?.sessionVersion).toBe(2); // unchanged
    expect(row?.suspendedAt).toBeNull();
  });

  it("softDelete: active → soft_deleted tombstones slug + revokes sessions", async () => {
    await seedOrg({ id: "o_1", slug: "acme" });
    const inv = makeFakeInvalidator();
    await applyOrgTransition(
      { orgId: "o_1", actor: GA_ACTOR, host: "acme.app.example.com" },
      { kind: "softDelete" },
      { db, invalidator: inv },
    );
    const tomb = await db.select().from(reservedSlugs).where(eq(reservedSlugs.slug, "acme"));
    expect(tomb[0]?.reason).toBe("tombstone");
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — discriminated `Transition` union + exhaustive switch in `TRANSITIONS`, single writer for the whole table:

```ts
import { auditLogs, liveOrganizations, organizations, reservedSlugs, sessions } from "@repo/db";
import type { Invalidator } from "@repo/tenancy";
import { eq, sql } from "drizzle-orm";

export type Transition =
  | { kind: "create"; data: { primaryAdminEmail: string; enforceSSO?: boolean } }
  | { kind: "suspend" }
  | { kind: "restore" }
  | { kind: "softDelete" };

export type LifecycleInput = Readonly<{
  orgId?: string;        // required for suspend|restore|softDelete
  slug?: string;         // required for create
  name?: string;
  actor: Actor;
  host: string;
}>;
export type LifecycleDeps = Readonly<{ db: DrizzleClient; invalidator: Invalidator }>;

export async function applyOrgTransition(
  input: LifecycleInput,
  transition: Transition,
  deps: LifecycleDeps,
  now: Date = new Date(),
): Promise<void> {
  await deps.db.transaction(async (tx) => {
    switch (transition.kind) {
      case "create":      /* ... insert org row, audit tenancy.org.created ... */ break;
      case "suspend":     /* ... live-org guard, set suspendedAt, bump sessionVersion, delete sessions, audit ... */ break;
      case "restore":     /* ... clear suspendedAt; do NOT decrement sessionVersion; audit ... */ break;
      case "softDelete":  /* ... set deletedAt, insert reservedSlugs row reason='tombstone', delete sessions, audit ... */ break;
      // biome-ignore lint/style/noUselessElse: exhaustive switch over Transition
      default: { const _exhaustive: never = transition; throw new Error(`unreachable: ${String(_exhaustive)}`); }
    }
  });
  await deps.invalidator.bumpVersion(input.host);
}
```

Convenience wrappers (`createTenant`, `suspendTenant`, `restoreTenant`, `softDeleteTenant`) are thin one-liners that build the `Transition` value and call `applyOrgTransition`. Note: audit-logs schema fields are `event` (not `action`), `metadata` jsonb (no `decision` column at top level).

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A6.6: `create` + `suspend` route wiring (deferred to B1)

Phase A exits with the full `applyOrgTransition` (A6.5) reachable as a service function only. No HTTP routes are wired in `apps/server`. B1 will:
- Create `apps/admin-server/src/modules/tenancy/admin-create.ts` exposing `POST /api/admin/orgs` → `applyOrgTransition(..., { kind: "create", ... })`.
- Create `apps/admin-server/src/modules/tenancy/admin-suspend.ts` exposing `POST /api/admin/orgs/:orgId/suspend` → `applyOrgTransition(..., { kind: "suspend" })`.
- Mount via the admin-server `ChainEntry` factory pattern.
- Plumb the global-admin session principal through `requestContext.principal`.

`restore` and `softDelete` arrows ship in A6.5 with service-layer tests; their HTTP routes are deferred beyond Phase A.

Exit criteria for Phase A: `applyOrgTransition` covers all four arrows with unit tests; `create` + `suspend` are ready to be invoked by B1.

## Exit criteria

- [ ] `Tenant` carries `sessionVersion`; `resolveTenant` projects it.
- [ ] Canonical `tenantJwtClaimsSchema` + `buildClaims` live in `packages/auth-tokens/src/claims.ts`; `apps/server/src/modules/auth/jwt-payload.ts` is a re-export wrapper (no duplicated schema).
- [ ] BA mints 15-minute JWTs with URL-form `aud`/`iss` + `org` claim + `jti`.
- [ ] `JtiKillList` ships with two adapters (`inMemoryJtiKillList` + `redisJtiKillList`); no public `RedisClient` seam is required by callers.
- [ ] `active-session-jwt.ts` owns the `current_jti`/`current_jti_exp` column pair + the mint stamp + the logout read; `runSessionDeleteAfter` does NOT touch the `sessions` table directly.
- [ ] Logout adds `jti` to the kill-list with TTL = `max(0, exp - now)`.
- [ ] `organization-lifecycle.ts` exposes `create | suspend | restore | softDelete` with a `TRANSITIONS` table; all four arrows have unit tests through `applyOrgTransition`; Phase A wires only `create`+`suspend` to handlers (via B1).
- [ ] Phase-A only: no admin HTTP routes in `apps/server`; B1 wires them on `apps/admin-server`.
