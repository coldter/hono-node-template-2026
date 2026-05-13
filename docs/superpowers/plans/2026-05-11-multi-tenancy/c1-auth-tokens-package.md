# C1 — `@repo/auth-tokens` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land `@repo/auth-tokens` — verifier-side helpers (`verifyTenantJwt`, `JwksCache`) used by mobile/service clients and by `apps/admin-server`'s operator-JWT path.

**Architecture:** Pure verifier; no minting. JWKS fetched via `jose` and cached with TTL + rotation. `jti` kill-list lookup against Redis injected as a dependency.

**Tech Stack:** `jose`, Redis client.

**References:** spec § 03, § 07; decisions D53, D70.

> **Conventions inherited:** chain factory, `liveOrganizations`, `bumpTenantCacheVersion`, `generateIdForModel`, `lifecycle.ts` single-writer, exhaustive switch with `biome-ignore`, drizzle generate-only, no `any`/`!`.

> **Schema source-of-truth:** The canonical `tenantJwtClaimsSchema` + `buildClaims(ctx, tenant)` builder live in `packages/auth-tokens/src/claims.ts` and land as part of **A6.1** (mint side). C1 builds the verify face ON TOP of that existing schema. Drift via duplicate Zod schemas in `apps/server`, `apps/admin-server`, or downstream services is forbidden.

---

## Task C1.1: Add verifier face to existing `@repo/auth-tokens`

> **Note:** `packages/auth-tokens/` already exists from A6.1 (scaffold + `claims.ts` mint-side schema were brought forward to satisfy the schema source-of-truth rule). C1.1 ADDS `verifyTenantJwt` + `JwksCache` ON TOP of the existing package. No new package scaffold. No schema duplication — `verifyTenantJwt` imports the SAME `tenantJwtClaimsSchema` from `./claims`.

**Files:**
- Modify: `packages/auth-tokens/src/index.ts` — extend exports to include `verifyTenantJwt`, `JwksCache`, types `VerifiedClaims` / `VerificationError`.
- Test: `packages/auth-tokens/src/__tests__/exports.test.ts`

- [ ] **Step 1: Failing test** — imports `verifyTenantJwt`, `JwksCache`, types `VerifiedClaims` / `VerificationError`; asserts the existing `tenantJwtClaimsSchema` export is still present and is the SAME schema object used internally by `verifyTenantJwt`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — stub exports for the verify face; verify-side modules will follow in C1.2/C1.3.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C1.2: `JwksCache` class

**Files:**
- Create: `packages/auth-tokens/src/jwks-cache.ts`
- Test: `packages/auth-tokens/src/__tests__/jwks-cache.test.ts`

- [ ] **Step 1: Failing test** — first call fetches; subsequent calls within TTL hit cache; key rotation forces a re-fetch on `kid` miss.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { createRemoteJWKSet, type JWTPayload, type JWSHeaderParameters } from "jose";

export class JwksCache {
  private readonly sets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
  constructor(private readonly ttlMs = 5 * 60_000) {}
  forIssuer(jwksUrl: string) {
    if (!this.sets.has(jwksUrl)) {
      this.sets.set(jwksUrl, createRemoteJWKSet(new URL(jwksUrl), { cacheMaxAge: this.ttlMs, cooldownDuration: 30_000 }));
    }
    return this.sets.get(jwksUrl)!;
  }
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C1.3: `verifyTenantJwt` — 8 invariants

**Files:**
- Create: `packages/auth-tokens/src/verify-tenant-jwt.ts`
- Create: `packages/auth-tokens/src/types.ts`
- Test: `packages/auth-tokens/src/__tests__/verify-tenant-jwt.test.ts`

- [ ] **Step 1: Failing test** — one case per invariant: bad signature, expired, nbf in the future, aud mismatch, iss mismatch, org.id mismatch, sessionVersion mismatch, jti in kill-list.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { jwtVerify } from "jose";

export type VerifiedClaims = Readonly<{ sub: string; org: { id: string; host: string; sessionVersion: number; slug: string | null }; jti: string; }>;
export type VerificationError = Readonly<{ ok: false; reason: "signature"|"exp"|"nbf"|"aud"|"iss"|"org_id"|"session_version"|"jti_killed" }>;

export async function verifyTenantJwt(token: string, deps: {
  tenant: { host: string; organizationId: string; sessionVersion: number };
  jwks: JwksCache;
  jwksUrl: string;
  isKilled(jti: string): Promise<boolean>;
}): Promise<VerifiedClaims | VerificationError> {
  const set = deps.jwks.forIssuer(deps.jwksUrl);
  let payload: any;
  try {
    const r = await jwtVerify(token, set, { issuer: `https://${deps.tenant.host}`, audience: `https://${deps.tenant.host}` });
    payload = r.payload;
  } catch (e: unknown) {
    // boundary: jose throws errors with `.code` we map.
    const code = (e as { code?: string }).code ?? "";
    if (code.includes("EXPIRED")) return { ok: false, reason: "exp" };
    if (code.includes("CLAIM_AUD")) return { ok: false, reason: "aud" };
    if (code.includes("CLAIM_ISS")) return { ok: false, reason: "iss" };
    if (code.includes("CLAIM_NBF")) return { ok: false, reason: "nbf" };
    return { ok: false, reason: "signature" };
  }
  const org = payload.org;
  if (!org || org.id !== deps.tenant.organizationId) return { ok: false, reason: "org_id" };
  if (org.sessionVersion !== deps.tenant.sessionVersion) return { ok: false, reason: "session_version" };
  if (await deps.isKilled(payload.jti)) return { ok: false, reason: "jti_killed" };
  return { sub: payload.sub, org, jti: payload.jti };
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C1.4: Wire into `apps/server` for mobile/service auth

**Files:**
- Create: `apps/server/src/middlewares/verify-bearer-jwt.ts`
- Test: `apps/server/src/middlewares/__tests__/verify-bearer-jwt.test.ts`

- [ ] **Step 1: Failing test** — request with no Bearer → unauth (or skip if cookie session present); valid Bearer → `c.var.user` set; stale `sessionVersion` → 401 with `reason=session_version`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** using `@repo/auth-tokens`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C1.5: AGENTS.md doc

**Files:**
- Create: `packages/auth-tokens/AGENTS.md`

- [ ] **Step 1: Document the package scope (verifier-only), key cache strategy, and the 8-invariant matrix.**

- [ ] **Step 2: Lint + self-review.**

## Exit criteria

- [ ] All 8 invariants exercised by the unit tests.
- [ ] JWKS cache rotates within TTL.
- [ ] `apps/server` validates Bearer JWTs via this package.
- [ ] No `any` outside the annotated jose-error boundary.
