# C4 — SSO Provider Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Consolidate SSO provider CRUD + envelope decryption behind `withDecryptedSecret(providerId, fn)` in `packages/db/src/sso-providers-repository.ts`.

**Architecture:** A single repository module that owns: insert (wrap-encrypt), read (no decryption — return wrapped), `withDecryptedSecret` (the only path that exposes plaintext). DEKs are zeroed in `finally`.

**References:** spec § 03, § 07; decisions D56, D73.

> **Reframe**: `sso-storage.ts` + `oidc-config-codec.ts` already implement create/findById + envelope encryption + tenant binding (via `bindDek`/`unbindDek`) + DEK zero-on-exit. C4 reduces to: (a) move from `apps/server/src/modules/auth/` into `packages/db/src/sso-providers-repository.ts` (or keep co-located if there's no second consumer yet — apply the "two-adapter" rule), (b) add `list(orgId)`, `withDecryptedSecret(...)`, `rotateSsoProviderSecret(...)`.

> **Note:** A4.7 already landed the `findById(id, organizationId)` tenant-scope tightening (security fix). C4 inherits that signature when migrating into `packages/db/src/sso-providers-repository.ts`; the tightening itself is NOT a C4 task.

---

## Task C4.1: Scaffold + interface

**Files:**
- Create: `packages/db/src/sso-providers-repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/__tests__/sso-providers-repository.test.ts`

- [ ] **Step 1: Failing test** — import surface: `createSsoProvider`, `findSsoProvider`, `listSsoProviders`, `withDecryptedSecret`, `rotateSsoProviderSecret`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** the named exports; bodies delegate to A4.2 codec + the existing storage helpers.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C4.2: `withDecryptedSecret` zero-on-exit semantics

**Files:**
- Test: `packages/db/__tests__/with-decrypted-secret.zero.test.ts`

- [ ] **Step 1: Failing test** — after the callback returns, the DEK buffer is zeroed (all-zero) and any plaintext intermediate buffer is zeroed.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Wire `.fill(0)` in `finally`; if the codec returns the decoded JSON string, zero it before returning the parsed object (the string is GC-eligible after parse).**

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C4.3: KEK rotation API — `rotateSsoProviderSecret(providerId)`

**Files:**
- Modify: `packages/db/src/sso-providers-repository.ts`
- Test: `packages/db/__tests__/rotate-sso-secret.test.ts`

- [ ] **Step 1: Failing test** — rotate increments `kek_version`, replaces `oidc_config_edek`, leaves `oidc_config_encrypted` unchanged (DEK re-wrap only).

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
export async function rotateSsoProviderSecret(deps: { db: DrizzleClient; vault: Vault }, providerId: string) {
  const row = await deps.db.select().from(ssoProviders).where(eq(ssoProviders.id, providerId)).limit(1).then(r => r[0]);
  if (!row) throw new NotFoundError();
  const dek = await deps.vault.unwrap(row.oidcConfigEdek, { keyId: `tenant/${row.organizationId}`, kekVersion: row.kekVersion });
  try {
    const newEdek = await deps.vault.wrap(dek, { keyId: `tenant/${row.organizationId}`, kekVersion: row.kekVersion + 1 });
    await deps.db.update(ssoProviders).set({ oidcConfigEdek: newEdek, kekVersion: row.kekVersion + 1 }).where(eq(ssoProviders.id, providerId));
  } finally { dek.fill(0); }
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task C4.4: Migrate all SSO callers to the repository

**Files:**
- Modify: every `sso_providers` direct query in the codebase
- Test: existing SSO tests stay green

- [ ] **Step 1: Audit** for direct `ssoProviders` queries. Replace with repository methods.

- [ ] **Step 2: Run characterization + lint**

- [ ] **Step 3: Self-review**

## Exit criteria

- [ ] All SSO provider access goes through `packages/db/src/sso-providers-repository.ts`.
- [ ] `withDecryptedSecret` is the only function exposing plaintext; DEK zeroed on exit.
- [ ] KEK rotation works without re-encrypting `oidc_config_encrypted`.
