# 07 — Deeper Modules

Package layout consolidating Phase C boundary extractions.

## Final package set

```
packages/
├── authorization/       # existing — extended with OPERATOR_PERMISSIONS
├── auth-tokens/         # NEW (Phase C C1) — verifier-side only
├── db/                  # existing — schema + Drizzle client + envelope-encryption helpers
├── email/               # existing
├── shared/              # existing — extended with wait-until.ts
├── tenancy/             # NEW (Phase A A2) — host parsing, cache, Hatchet-event invalidation
└── ui/                  # NEW (Phase B B5) — shadcn CLI v4 monorepo
```

## `@repo/tenancy`

See [02-tenant-resolution.md](./02-tenant-resolution.md). Owns the security boundary for host → org mapping. Pure functions where possible; cache and DB injected; no module-scope mutable state.

Public surface:
- `loadHostConfigOnce(env)` → `HostConfig`
- `parseHostname(host, config)` → `ParsedHost`
- `resolveTenant(host, deps)` → `TenantResolution`
- `tenantMiddleware(deps)` Hono middleware
- `hostHeaderGuard(deps)` Hono middleware
- `createInvalidator(deps)` → `Invalidator`
- `createFanOutInvalidator(deps)` → `FanOutInvalidator`
- `createTenantInvalidationSubscriber(deps)` → registers a Hatchet workflow on `tenancy.invalidate`
- Types: `Tenant`, `TenantNotFound`, `TenantSuspended`, `TenantResolution`, `TenancyEnv`

## `@repo/auth-tokens` (Phase C C1)

**Verifier-side only.** Better Auth continues to mint (D70 port).

```
packages/auth-tokens/
├── src/
│   ├── verify-tenant-jwt.ts     # 8-invariant check
│   ├── jwks-cache.ts            # class JwksCache with TTL + rotation
│   ├── types.ts                 # VerifiedClaims, VerificationError discriminated union
│   └── index.ts
└── __tests__/
```

Public surface:
- `verifyTenantJwt(token, expected) → VerifiedClaims | VerificationError`
- `class JwksCache`
- Types: `VerifiedClaims`, `VerificationError`, `VerificationErrorReason`

The 8 invariants (D53 port + ND10 layered model — extension over worker plan's 5):
1. Valid signature against tenant-issuing JWKS.
2. `exp > now()`.
3. `nbf <= now()` (if present).
4. `aud === \`https://${expected.tenant.host}\``.
5. `iss === \`https://${expected.tenant.host}\``.
6. `org.id === expected.tenant.organizationId`.
7. `org.sessionVersion === expected.tenant.sessionVersion`.
8. `jti NOT IN` Redis kill-list.

Used by:
- Mobile clients hitting `/api/*` directly with `Authorization: Bearer ...`.
- Service-to-service flows (background workers verifying a request that originated from a logged-in user).

NOT used inside BA's own handler chain — BA handles its own session/JWT cycle.

## `@repo/authorization` extensions

The existing package gains:
- `src/operator-permissions.ts` — `OPERATOR_PERMISSIONS` matrix.
- `src/types.ts` — `OperatorAction`, `GlobalAdminSubRole`.
- `src/where-global-admin-role.ts` — `whereGlobalAdminRole(...subRoles)` Drizzle predicate helper (D36 port).
- `src/require-operator.ts` — Hono middleware factory.

No new package needed. Decision: extend the existing `@repo/authorization`.

## `@repo/shared` extensions

- `src/wait-until.ts` — bounded SIGTERM-aware promise tracker.
- `src/cuid.ts` — already exists; gains `ID_PREFIXES` for new entities (`tnh`, `vtok`, `ga`, `ssop`, `vtok`).

## `@repo/db` extensions

- `src/schema/*` — new tables per [08-schema-and-migrations.md](./08-schema-and-migrations.md).
- `src/envelope-encrypt.ts` — `wrapDek(plaintext, orgId)`, `unwrapDek(edek, orgId, kekVersion)` calling into `apps/server/src/lib/vault`. Surface kept in `@repo/db` so the DB-write paths can call it without depending on `apps/server`.
- `src/live-organizations.ts` — **public export** `liveOrganizations(executor)`: sanctioned read seam for the `organizations` table. Every shape (`select`, `selectById`, `selectBySlug`, `findFirst`) pre-binds `WHERE deleted_at IS NULL`. The structural CI test at `packages/db/__tests__/live-organizations.spec.ts` rejects any direct `from(organizations)` or `query.organizations.findFirst|findMany` callsite outside a documented ALLOWLIST. Ports verbatim from `/home/kuldeep/code/personal/worker-template-2026/packages/db/src/live-organizations.ts`.
- `src/sso-providers-repository.ts` — `withDecryptedSecret(organizationId, providerRowId, fn)` (Phase C C4). Tenant-scoped on every method by gating WHERE clauses with `eq(ssoProviders.organizationId, organizationId)`; see canonical port at `apps/server/src/modules/org-admin/sso/repository.ts` in the worker repo.

## Service surfaces (in `apps/server`)

### `customHostnameLifecycle` (Phase C C3)

`apps/server/src/services/custom-hostname-lifecycle.ts`. Single owner of:
- `request(orgId, hostname, actor)` → row
- `verifyTxt(id, actor)` → updated row
- `list(orgId)` → rows
- `remove(id, actor)` → row
- `reconcileOne(id)` → action
- `reconcileAll()` → summary

Called from Hono handlers (thin glue) and from the Hatchet workflow.

### `tenantOperations` (Phase C C5)

`apps/server/src/services/tenant-operations.ts`. Single owner of org CRUD:
- `create({ slug, name, enforceSSO, primaryAdminEmail }, by)` → org
- `suspend(orgId, by)` → org
- `restore(orgId, by)` → org
- `softDelete(orgId, by)` → org (tombstone slug → `reserved_slugs`)

`by` accepts `GlobalAdmin | SystemActor` (D67 port). Dual-scope CRITICAL audit on every mutation.

### Not extracted in v1

- `tenantOperations.rename` (D66) — stub throws.
- Operator impersonation (D24).
- SAML SSO (D2 second half).
- Apex tenant domains.

## Module dependency invariants

```
@repo/shared ← (no internal deps)
@repo/db ← @repo/shared
@repo/authorization ← @repo/shared
@repo/tenancy ← @repo/db, @repo/shared
@repo/auth-tokens ← @repo/shared
@repo/ui ← (no @repo/* deps — frontend only)
@repo/email ← @repo/shared

apps/server ← @repo/db, @repo/tenancy, @repo/authorization, @repo/auth-tokens, @repo/shared, @repo/email
apps/admin-server ← @repo/db, @repo/authorization, @repo/auth-tokens, @repo/shared, @repo/email
apps/app ← @repo/ui (build-time)
apps/admin-ui ← @repo/ui (build-time)
```

No reverse imports. Enforced by Knip config + a CI grep that rejects `apps/server/...` imports inside `packages/`.
