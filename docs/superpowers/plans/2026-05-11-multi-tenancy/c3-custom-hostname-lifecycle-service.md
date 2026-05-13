# C3 — Custom-Hostname Lifecycle: Verification PR

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Status:** Superseded by A5 + the architectural deepening session. `apps/server/src/modules/tenancy/lifecycle.ts` is the single-writer state machine; `custom-hostname-service.ts` owns admission control (rate limits, hostname shape); the reconciler is the third caller of lifecycle. Per D74, the modules stay co-located in `apps/server` — there are no file moves, no service-directory extraction, and no deletions.

**Phase-C deliverable:** a single verification PR confirming the surface (`request`, `verifyTxt`, `list`, `remove`, `reconcileOne`, `reconcileAll`) matches the spec, with no file moves and no deletions. May add minor interface-tightening (e.g., narrower types on `list(orgId)`'s return value at `custom-hostname-service.ts:206`) if drift is observed. Otherwise the PR is a no-op confirmation.

**References:** spec § 04, § 07; decisions D57, D74.

---

## Task C3.1: Surface verification PR

**Files:**
- Audit only: `apps/server/src/modules/tenancy/lifecycle.ts`, `apps/server/src/modules/tenancy/custom-hostname-service.ts`, `apps/server/src/workflows/reconcile-hostnames.ts`

- [ ] **Step 1:** Confirm the exposed surface from `custom-hostname-service.ts` is exactly `{ request, verifyTxt, list, remove, reconcileOne, reconcileAll }` and matches the spec. Note that `list` is already implemented at `custom-hostname-service.ts:206`.

- [ ] **Step 2:** Confirm `lifecycle.ts` is the single state-machine writer; `custom-hostname-service.ts` is the admission-control front door; the reconciler workflow delegates to lifecycle (third caller). No duplicated state transitions.

- [ ] **Step 3:** If any interface looks leaky (e.g., `list(orgId)` returning a too-wide type, or a public export that is only used internally), tighten in place — do NOT move the file.

- [ ] **Step 4:** Run the existing tenancy test suite; no new tests required unless step 3 introduced a typing change worth covering.

- [ ] **Step 5:** Lint + self-review.

## Exit criteria

- [ ] Surface (`request`, `verifyTxt`, `list`, `remove`, `reconcileOne`, `reconcileAll`) verified against spec.
- [ ] No file moves, no deletions; co-located per D74.
- [ ] Any minor interface tightening landed without behavior change.
