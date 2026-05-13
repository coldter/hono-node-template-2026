# Multi-Tenancy Implementation Plans

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source spec:** [../../specs/2026-05-11-multi-tenancy-design/](../../specs/2026-05-11-multi-tenancy-design/). This folder is the executable plan derived from that spec.

**Git policy:** No git operations during plan execution. Each task ends with `Lint + review` (`bun run check` + self-review). Treat the executor's working copy as the source of truth; VCS captures the work between sessions.

## Phases

| Phase | Files | Deployable at end? |
|---|---|---|
| **0** — Validation spike | `00-phase-0-validation.md` | No |
| **A** — Core multi-tenancy | `a1` through `a7` | **Yes** (after A7) |
| **B** — Admin server + admin-ui rename | `b1`, `b2`, `b3` (+ final knip/AGENTS walk) | **Yes** (after B3) |
| **C** — Deepening + cleanup | `c1` through `c6` | **Yes** (after C6) |
| **Future** — Deferred Phase-B remainder | `b4`, `b5`, `b6`, most of `b7` | n/a (later phase) |

> **Phase C status after the deepening session:**
> - C1 (`@repo/auth-tokens`) still motivated; promote ahead of B1.
> - C2 (operator authz) hard-blocked on B1 (`apps/admin-server` scaffold).
> - C3 (custom-hostname-lifecycle service) — most of the seam already exists post-A5+deepening; D74 says co-locate in `apps/server`, conflicting with the plan's `services/` move. Downgrade C3 to "tighten the existing lifecycle/service interface; don't move files."
> - C4 (sso-provider repository) — `sso-storage.ts` + `oidc-config-codec.ts` already implement most of the pattern (including `bindDek`/`unbindDek` tenant binding and DEK zero-on-exit). C4 reduces to: add `list`/`withDecryptedSecret`/`rotateSsoProviderSecret`; tighten `findById` to be tenant-scoped (currently leaks across orgs).
> - C5 (tenant-operations service) — if A6.5 lands `apps/server/src/modules/tenancy/organization-lifecycle.ts`, C5 builds on it; otherwise C5 ships the file fresh.
> - C6 (route cleanup) — generic knip pass; run last.

## Read order

| # | File | Tasks |
|---|---|---|
| 1 | [00-phase-0-validation.md](./00-phase-0-validation.md) | 8 |
| 2 | [a1-schema.md](./a1-schema.md) | 13 |
| 3 | [a2-tenancy-package.md](./a2-tenancy-package.md) | 10 |
| 4 | [a3-better-auth-config.md](./a3-better-auth-config.md) | 7 |
| 5 | [a4-sso-plugin.md](./a4-sso-plugin.md) | 6 |
| 6 | [a5-custom-hostnames.md](./a5-custom-hostnames.md) | 8 |
| 7 | [a6-jwt-and-sessions.md](./a6-jwt-and-sessions.md) | 6 |
| 8 | [a7-local-dev.md](./a7-local-dev.md) | 8 |
| 9 | [b1-apps-admin-server.md](./b1-apps-admin-server.md) | 9 |
| 10 | [b2-operator-onboarding.md](./b2-operator-onboarding.md) | 6 |
| 11 | [b3-apps-admin-ui.md](./b3-apps-admin-ui.md) (rename `apps/web` → `apps/admin-ui`) | 6 |
| 12 | [b4-apps-app-spa.md](./b4-apps-app-spa.md) — **DEFERRED** | 0 |
| 13 | [b5-packages-ui.md](./b5-packages-ui.md) — **DEFERRED** | 0 |
| 14 | [b6-per-tenant-branding.md](./b6-per-tenant-branding.md) — **DEFERRED** | 0 |
| 15 | [b7-frontend-tooling.md](./b7-frontend-tooling.md) — **MOSTLY DEFERRED** (single-OpenAPI-writer carve-out folded into B3.2; final knip pass closes Phase B) | 0 |
| 16 | [c1-auth-tokens-package.md](./c1-auth-tokens-package.md) | 5 |
| 17 | [c2-operator-auth-authz.md](./c2-operator-auth-authz.md) | 6 |
| 18 | [c3-custom-hostname-lifecycle-service.md](./c3-custom-hostname-lifecycle-service.md) | 5 |
| 19 | [c4-sso-provider-repository.md](./c4-sso-provider-repository.md) | 4 |
| 20 | [c5-tenant-operations-service.md](./c5-tenant-operations-service.md) | 6 |
| 21 | [c6-route-cleanup.md](./c6-route-cleanup.md) | 3 |

## Step structure (TDD-style, no-git)

Each task follows this pattern:

```
1. Failing test first — write the test that asserts the new behaviour.
2. Run, watch fail — confirm the failing message.
3. Implement — the minimal change that makes the test pass.
4. Run, watch pass — confirm green.
5. Lint + check — `bun run fix` and `bun run check` from repo root.
6. Self-review — diff scan, mark checkbox.
```

No commit steps. The execution checkpoint is `Lint + review`; do not commit from inside a plan-execution session unless the human explicitly asks.

## Phase dependency chain

```
Phase 0 (validation spike)
   ├── locks Caddy `permission http` contract shape
   ├── locks Hatchet-events vs LISTEN/NOTIFY invalidation latency budget
   ├── locks BA `^1.6.10` SSO column shape on Drizzle `^0.45.2`
   ├── locks sanitized BA proxy header matrix
   ├── locks dev-host config (*.localhost vs lvh.me)
   └── locks envelope-encryption key/vault interface
        │
        ▼
Phase A: A1 → A2 → A3 → A4 → A5 → A6 → A7
   (schema → @repo/tenancy → BA config → SSO → Caddy hostnames →
    layered JWT → local-dev harness)
        │
        ▼
Phase B: B1 → B2 → B3 → (final knip + AGENTS walk)
   (admin server → operator onboarding →
    apps/web → apps/admin-ui rename + admin-server OpenAPI rewire →
    end-of-phase cleanup commit)

   Deferred to a later phase: B4 (apps/app tenant SPA), B5 (packages/ui),
   B6 (per-tenant branding), most of B7 (frontend tooling for two SPAs).
        │
        ▼
Phase C: C1 → C2 → C3 → C4 → C5 → C6
   (@repo/auth-tokens → operator auth/authz → custom-hostname service →
    SSO provider repo → tenant operations service → route cleanup)
```

**Hard ordering:** Phase 0 → A → B → C. Inside Phase A, A2 and A3 can be parallelized with separate engineers after A1 lands. Inside Phase B, B3 (`apps/web` → `apps/admin-ui` rename) lands at the END of the phase, after B1 (admin-server) and B2 (operator onboarding) are wrapped — the rename depends on `apps/admin-server`'s OpenAPI being stable so the regenerated `api.gen/` is not thrown away. B1.0 (extract `packages/hono-app`) precedes both B1.1 (admin-server scaffold) and any B-phase code touching `apps/server`'s chain. This unblocks parallel `apps/server` ↔ `apps/admin-server` evolution. A7.0 (test-harness workspace) precedes A7.5+.

## Plan-architecture review applied (2026-05-12+)

Major restructuring landed across the plan files after the deepening session:

- **A6.5 absorbs C5** — the organization-lifecycle four-arrows service ships in A6.5 rather than as a standalone Phase-C task; C5 either builds on it or ships fresh if A6.5 slips.
- **`@repo/auth-tokens` schema lands in A6**, not C1; C1 is reduced to the package extraction.
- **B1.0 extracts `packages/hono-app`** — chain machinery + generic `RequestContext<TPrincipal>` envelope + `bootHonoApp` runner — so `apps/server` and `apps/admin-server` are two adapters at the same seam (no duplicated middlewares).
- **B1.3a extracts `createAuthBase(deps)`** — tenant and operator BA factories compose on top of one base; no copy-paste of `instance.ts`.
- **Unified `Principal` discriminated union** — `c.var.requestContext.principal: { kind: "tenant-user"; ... } | { kind: "operator"; ... } | null`; no separate `operator` / `principal` slots.
- **C2 consolidates into `@repo/authorization/src/operator-policy.ts`** — one file owns the matrix, the Drizzle predicate, and the framework-agnostic `assertPermitted`; the Hono `requireOperator` is a thin wrapper.
- **No new packages for auth-types or invitations** — cross-app type sharing uses a tsconfig path alias (`@admin-server/auth`); only the `USER_ALREADY_EXISTS` recovery shape + invitation-URL builder ship as `packages/shared/src/invitation.ts`.
- **Operator-enroll `lifecycle.ts` cargo-cults shape, not abstraction** — same file shape as tenant `lifecycle.ts`, but no generic `applyTransition<TState>` extracted. Re-evaluate at four state machines, not three.
- **Phase B scope shrink (2026-05-12+):** dropped the `apps/app` tenant SPA, the `packages/ui` extraction, per-tenant branding, and the dual-SPA frontend tooling from Phase B. The single Phase-B web-app deliverable is `apps/web` → `apps/admin-ui` rename. All other web-app work moves to a later phase. The `packages/hono-app` extraction (B1.0) still happens — it's prerequisite for the admin-server.

## How to read each plan

- **Plan executor:** start with `00-phase-0-validation.md`. Each file ends with an `Exit criteria` block. After Phase 0, work A1 → A7 in order. After A7, branch for Phase B; after B7, branch for Phase C.
- **Reviewer:** read the spec section (`docs/superpowers/specs/2026-05-11-multi-tenancy-design/`) first, then the plan's intro and exit criteria.

## Cross-cutting invariants enforced in every plan

- No `any`. No non-null assertions. `unknown` only at validated boundaries with `// boundary:` comments.
- No emojis in code, comments, or commit messages.
- `httpInstrumentationMiddleware` from `@hono/otel` must be registered first or trace IDs drop.
- Postgres connects as a single non-superuser app user. Tenant isolation is enforced by `liveOrganizations(executor)` for the `organizations` table and service / repository-layer `organizationId` gating for every other tenant-scoped table; the structural ALLOWLIST CI test in `packages/db/__tests__/live-organizations.spec.ts` enforces the seam at CI.
- Cross-tenant isolation test (testcontainers `postgres:18-alpine`) added at the service / repository layer with every new tenant-scoped table — the test asserts a query gated on `organizationId=A` returns no rows where `organizationId=B`.

## Version pins to refresh at the start of each phase

Bump pins per `docs/superpowers/specs/2026-05-11-multi-tenancy-design/10-decisions.md` § Version pins at the start of each phase. The 2026-05-12 floor across plans: Bun `1.3.12`, Hono `^4.12.18` (CVE remediation), `@hono/zod-openapi` `^1.4.0`, `@hono/node-server` `^2.0.2`, `@hono/otel` `^1.1.2`, Better Auth `^1.6.10`, `@better-auth/sso` `^1.6.10`, `lru-cache` `^11.3.6`, `@hatchet-dev/typescript-sdk` `^1.22.1`, Vitest `^4.1.6`, `pg` `^8.20.0` (note: the legacy pin `pg 9.x` was a plan error — `pg` 9.0 does not exist), Postgres server `18.3` minimum (CVE-2026-2005 pgcrypto heap overflow fixed in 18.2), `drizzle-orm` `^0.45.2` (Drizzle 1.0 RC deferred to Phase D), Caddy `2.11.2`. Run `bun pm ls` plus a WebSearch on each pin; if any pin has a newer documented CVE since 2026-05-12, bump it before continuing.
