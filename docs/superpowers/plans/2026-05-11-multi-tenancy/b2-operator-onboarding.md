# B2 — Operator Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** First-operator bootstrap via `bun run seed:operator` + `/enroll?token=...` redemption + tenant-admin invitation via the BA `organization.invitation` table.

**Architecture:** A seed script that inserts a `global_admins` row with a hashed enrollment token; a `/api/operator-enroll` endpoint on `apps/admin-server` that redeems the token once and binds a BA user; an invitation accept path on `apps/server` for tenant admins.

**Tech Stack:** BA `^1.6.10` admin plugin, BA `organization` plugin invitations.

**References:** spec § 05 enrollment-token; decisions D23, D31, D60, D77.

> **Pattern**: the operator-enroll state machine (`pending → bound → expired`) should follow `apps/server/src/modules/tenancy/lifecycle.ts` (single-writer + `TRANSITIONS` table + discriminated `Transition` type). Do NOT inline state changes as ad-hoc `db.update`. Acceptance endpoint mounts in `apps/server`'s `chain.ts` BEFORE the BA `/api/auth/*` catch-all.

> **Convention preamble (shape vs abstraction):** The operator-enrollment state machine in `apps/admin-server/src/modules/enroll/lifecycle.ts` cargo-cults the FILE SHAPE of `apps/server/src/modules/tenancy/lifecycle.ts` (single-writer + `TRANSITIONS` constant + discriminated `Transition` union) but does NOT extract a generic `applyTransition<TState>` primitive. Shape similarity is leverage on cognition; abstraction at three adapters would fight each domain (tenant-custom-hostnames, organizations, operator-enroll). Re-evaluate only if a fourth domain appears.

> **Principal shape:** Handlers in this file read `c.var.requestContext.principal` (discriminated by `kind`), not `c.var.requestContext.operator`. See B1's envelope shape: `principal: { kind: "operator"; operator: { id, subRole, email } } | null` on admin-server, `principal: { kind: "tenant-user"; user; session } | null` on tenant-server.

---

## Task B2.1: `bun run seed:operator` script

**Files:**
- Create: `scripts/seed-operator.ts`
- Modify: `package.json` (root)
- Test: `scripts/__tests__/seed-operator.test.ts`

- [ ] **Step 1: Failing test** — running with `--email x@y --role platform_admin` inserts a `global_admins` row with `enrollment_token_hash` set and prints a token starting with `gae_`. The plaintext token is NEVER persisted.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { randomBytes, createHash } from "node:crypto";
const email = parseArg("--email");
const role = parseArg("--role") as "platform_admin"|"support"|"read_only";
const token = `gae_${randomBytes(24).toString("hex")}`;
const hash = createHash("sha256").update(token).digest();
await db.insert(globalAdmins).values({ email, subRole: role, enrollmentTokenHash: hash, enrollmentExpiresAt: new Date(Date.now() + 24*3600_000) });
console.log(`Enrollment URL: https://${env.ADMIN_HOST}/enroll?token=${token}`);
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B2.2: `POST /api/operator-enroll` redemption

**Files:**
- Create: `apps/admin-server/src/modules/enroll/routes.ts`
- Test: `apps/admin-server/src/modules/enroll/__tests__/routes.test.ts`

- [ ] **Step 1: Failing test** — valid token + password → BA user created (admin path), `global_admins.user_id` bound, `enrollment_token_hash` cleared; second use → 410; expired → 410.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { createHash } from "node:crypto";

app.openapi(createRoute({ method: "post", path: "/api/operator-enroll", request: { body: { content: { "application/json": { schema: z.object({ token: z.string(), password: z.string().min(12) }) } } } }, responses: { 200: ..., 410: ... }}), async (c) => {
  const { token, password } = c.req.valid("json");
  const hash = createHash("sha256").update(token).digest();
  const [row] = await db.select().from(globalAdmins).where(and(eq(globalAdmins.enrollmentTokenHash, hash), gt(globalAdmins.enrollmentExpiresAt, new Date()), isNull(globalAdmins.userId))).limit(1);
  if (!row) return c.body(null, 410);
  // Create BA user via admin path (bypasses disableSignUp; documented in 11-gotchas).
  const created = await auth.api.adminCreateUser({ body: { email: row.email, password, _fromInvitation: true } });
  await db.update(globalAdmins).set({ userId: created.user.id, boundAt: new Date(), enrollmentTokenHash: null, enrollmentExpiresAt: null }).where(eq(globalAdmins.id, row.id));
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B2.3: Tenant admin invitation flow

**Files:**
- Create: `apps/admin-server/src/modules/tenants/invite-admin.ts`
- Modify: `packages/shared/src/invitation.ts` (NEW — only the `USER_ALREADY_EXISTS` recovery response shape `{ requiresLogin: true; email: string }` and the invitation-URL builder). Both ends of the lifecycle (admin-server B2.3 and tenant-server B2.4) consume this contract.
- Test: `apps/admin-server/src/modules/tenants/__tests__/invite-admin.test.ts`

> **No `packages/invitations`.** A full invitations package would be a re-export of BA APIs. Extract ONLY the shared recovery shape and the URL builder into `packages/shared/src/invitation.ts`; everything else (handler logic, BA API calls, email orchestration) lives in its respective app.

- [ ] **Step 1: Failing test** — operator (read via `c.var.requestContext.principal`, narrow on `kind === "operator"`) with `tenant.create` permission can invite an email; BA `invitation` row created for that org; invite token returned in response (for email send via existing `@repo/email`). The response uses the URL builder from `packages/shared/src/invitation.ts`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — narrow `c.var.requestContext.principal` on `kind === "operator"` to read operator identity; call `auth.api.createInvitation({ body: { email, organizationId, role: "owner" } })` via BA `organization` plugin; trigger `@repo/email` to send; build the URL via the shared helper.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B2.4: `/accept-invite/:invitationId` recovery on `USER_ALREADY_EXISTS` (D60)

**Files:**
- Create: `apps/server/src/modules/auth/accept-invite.ts`
- Consume: `packages/shared/src/invitation.ts` (recovery response shape `{ requiresLogin: true; email: string }`, introduced in B2.3 — do NOT create a `packages/invitations`).
- Test: `apps/server/src/modules/auth/__tests__/accept-invite.test.ts`

- [ ] **Step 1: Failing test** — accepting an invitation with an email that's already registered returns a "sign-in-then-accept" response matching the shared shape from `packages/shared/src/invitation.ts`, not an error.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** the recovery shim around BA's `acceptInvitation` API: catch `USER_ALREADY_EXISTS`, return `{ requiresLogin: true, email }` using the imported type.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B2.5: CRITICAL audit on each onboarding action

**Files:**
- Modify: enroll redemption + invite handlers
- Test: assertions added to existing tests

- [ ] **Step 1: Failing test** — after enrollment redemption, audit_logs has `global_admin.enrolled` row with `actor_type='GLOBAL_ADMIN'`, `actor_id=<new ga id>`, `decision='allow'`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Wire `auditLogCritical` calls; tests pass.**

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B2.6: Email templates

**Files:**
- Create: `packages/email/src/templates/operator-enrollment.tsx`
- Create: `packages/email/src/templates/tenant-admin-invite.tsx`
- Test: `packages/email/src/templates/__tests__/...`

- [ ] **Step 1: Failing test** — render returns HTML containing the enrollment URL token / invitation URL.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** React Email templates per existing conventions.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Exit criteria

- [ ] `bun run seed:operator` produces a working enrollment URL; token is single-use.
- [ ] `/api/operator-enroll` binds BA user to `global_admins`; CRITICAL audit emitted.
- [ ] Tenant admin invitation works end-to-end including `USER_ALREADY_EXISTS` recovery.
- [ ] Email templates render with the right URLs.
