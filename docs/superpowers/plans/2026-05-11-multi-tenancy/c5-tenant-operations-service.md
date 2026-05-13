# C5 — `tenantOperations` Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Single owner of org CRUD: `create`, `suspend`, `restore`, `softDelete` — with consistent CRITICAL dual-scope audit and `FanOutInvalidator.bumpVersion()` on mutations. Phase-A and B handlers delegate here.

**Architecture:** Service in `apps/server/src/services/tenant-operations.ts`. `by` parameter accepts `GlobalAdmin | SystemActor`. Soft-delete unifies tombstone via `reserved_slugs` insert.

**References:** spec § 07; decisions D34, D37, D54, D67.

> **Conventions inherited:** chain factory, `liveOrganizations`, `bumpTenantCacheVersion`, `generateIdForModel`, `lifecycle.ts` single-writer, exhaustive switch with `biome-ignore`, drizzle generate-only, no `any`/`!`.

> ## SUPERSEDED BY A6.5
>
> A6.5 ships `apps/server/src/modules/tenancy/organization-lifecycle.ts` as the single-writer state machine with all four arrows (`create`, `suspend`, `restore`, `softDelete`) and a discriminated `Transition` union — landing in Phase A with service-layer tests for every arrow.
>
> **C5 reduces to:** wire admin-server handlers (B1.6) to call the existing `applyOrgTransition` arrows. **No new service file** in `apps/server/src/services/`. Audit + invalidator-bump live INSIDE `organization-lifecycle.ts`; handlers don't repeat them. The `rename` (D66) stub stays here as the only fresh task — see C5.5.
>
> All tasks below are marked OBSOLETE; the only live task is the renamed C5.6.

---

## ~~Task C5.1: Service surface + characterization tests~~ (OBSOLETE — see A6.5)

Replaced by the `Transition` discriminated union + `applyOrgTransition` exhaustive switch in `organization-lifecycle.ts`.

<details><summary>Original (obsolete) task</summary>

## Task C5.1: Service surface + characterization tests

**Files:**
- Create: `apps/server/src/services/tenant-operations.ts`
- Modify: `apps/server/src/services/index.ts`
- Test: `apps/server/src/services/__tests__/tenant-operations.test.ts`

- [ ] **Step 1: Failing test** — surface: `create({ slug, name, enforceSSO, primaryAdminEmail }, { by })`, `suspend(orgId, { by })`, `restore(orgId, { by })`, `softDelete(orgId, { by })`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — direct Drizzle inserts wrapped in transactions; each emits the right audit + invalidator bump.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

</details>

## ~~Task C5.2: `create` — slug + reserved-slugs check + invitation~~ (OBSOLETE — see A6.5)

The `create` arrow lands in A6.5's `TRANSITIONS` table. Reserved-slug + tombstone guards live inside `applyOrgTransition({kind:"create"})`.

<details><summary>Original (obsolete) task</summary>

## Task C5.2: `create` — slug + reserved-slugs check + invitation

**Files:**
- Modify: `apps/server/src/services/tenant-operations.ts`
- Test: ...

- [ ] **Step 1: Failing test** — creating with a reserved slug throws; creating with a tombstoned slug throws; success path creates org + sends primary admin invite.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

</details>

## ~~Task C5.3: `suspend` + `restore` (move from A6.5)~~ (OBSOLETE — see A6.5)

Both arrows land in A6.5 from day one. There is no `apps/server/src/modules/tenancy/suspend.ts` to delete — the writer is `organization-lifecycle.ts`.

<details><summary>Original (obsolete) task</summary>

## Task C5.3: `suspend` + `restore` (move from A6.5)

**Files:**
- Modify: `apps/server/src/services/tenant-operations.ts`
- Delete: `apps/server/src/modules/tenancy/suspend.ts` (the A6.5 module)

- [ ] **Step 1: Failing test** — same assertions as A6.5 but driven through the new service.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — port the suspend logic, add restore, ensure audit + bumpVersion fire.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

</details>

## ~~Task C5.4: `softDelete` + tombstone (D37)~~ (OBSOLETE — see A6.5)

`softDelete` arrow lands in A6.5; tombstone insert into `reserved_slugs` happens inside `applyOrgTransition({kind:"softDelete"})`.

<details><summary>Original (obsolete) task</summary>

## Task C5.4: `softDelete` + tombstone (D37)

**Files:**
- Modify: `apps/server/src/services/tenant-operations.ts`
- Test: ...

- [ ] **Step 1: Failing test** — softDelete sets `deleted_at`, inserts `reserved_slugs (slug, reason='tombstone', organization_id)` row, revokes sessions, bumps invalidator.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** in a single transaction.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

</details>

## Task C5.5: `rename` stub (D66 deferred) — only live task in this file

**Files:**
- Modify: `apps/server/src/modules/tenancy/organization-lifecycle.ts` — add a `rename` arrow to the `Transition` union whose body throws `not_implemented`.

- [ ] **Step 1: Failing test** — `applyOrgTransition(..., { kind: "rename", newSlug: "x" })` throws `Error("not_implemented")` with a clear message.

- [ ] **Step 2: Implement** the throwing stub so the type surface is complete.

- [ ] **Step 3: Lint + self-review.**

## Task C5.6: Admin handlers call `applyOrgTransition`

**Files:**
- Modify: `apps/admin-server/src/modules/tenants/handlers.ts`
- Test: existing handler tests stay green

- [ ] **Step 1: Replace any inline Drizzle inserts/updates with calls to `applyOrgTransition` from `apps/server/src/modules/tenancy/organization-lifecycle.ts` (or a re-export). Handlers MUST NOT repeat the audit or invalidator-bump — those live inside the writer.**

- [ ] **Step 2: Run characterization + lint.**

- [ ] **Step 3: Self-review.**

## Exit criteria

- [ ] `organization-lifecycle.ts` (from A6.5) owns all org CRUD; handlers are thin call-sites.
- [ ] Every arrow emits CRITICAL dual-scope audit + invalidator bump from inside the writer.
- [ ] `softDelete` inserts a tombstone in `reserved_slugs` (lands in A6.5).
- [ ] `rename` stub throws; documented as v2.
