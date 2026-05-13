# A4 — SSO Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire `@better-auth/sso` for per-tenant OIDC providers with envelope-encrypted client secrets.

**Architecture:** BA SSO plugin reads per-tenant `sso_providers` rows. Encryption is wrapped via a tiny adapter in `packages/db/src/sso-storage.ts` that intercepts the BA-managed JSON blob, encrypts before insert, decrypts on read. Vault wrap/unwrap stays in `apps/server/src/lib/vault`.

**Tech Stack:** `@better-auth/sso`, `pgcrypto`, `apps/server/src/lib/vault`.

**References:** spec § 03 SSO section; decisions D2, D6, D8, D78, ND11.

> **Conventions inherited:** chain factory, `liveOrganizations`, `bumpTenantCacheVersion`, `generateIdForModel`, `lifecycle.ts` single-writer, exhaustive switch with `biome-ignore`, drizzle generate-only, no `any`/`!`.

---

## Task A4.1: `oidc-config-codec.ts` — wrap/unwrap helper

**Files:**
- Create: `apps/server/src/modules/auth/oidc-config-codec.ts`
- Test: `apps/server/src/modules/auth/__tests__/oidc-config-codec.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { encodeOidcConfig, decodeOidcConfig } from "../oidc-config-codec";
import { fakeVault } from "@/lib/vault/fake";

describe("oidc config codec", () => {
  it("round-trips through envelope encryption", async () => {
    const vault = fakeVault();
    const { encrypted, edek, kekVersion } = await encodeOidcConfig({ clientId: "x", clientSecret: "y" }, "org_1", vault);
    const back = await decodeOidcConfig({ encrypted, edek, kekVersion }, "org_1", vault);
    expect(back).toEqual({ clientId: "x", clientSecret: "y" });
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { vault } from "@/lib/vault";

export async function encodeOidcConfig(plain: object, orgId: string, v = vault) {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const edek = await v.wrap(dek, { keyId: `tenant/${orgId}`, kekVersion: 1 });
  // Pack iv|tag|ciphertext
  return { encrypted: Buffer.concat([iv, tag, enc]), edek, kekVersion: 1 };
}

export async function decodeOidcConfig(row: { encrypted: Buffer; edek: Buffer; kekVersion: number }, orgId: string, v = vault) {
  const dek = await v.unwrap(row.edek, { keyId: `tenant/${orgId}`, kekVersion: row.kekVersion });
  try {
    const iv = row.encrypted.subarray(0, 12);
    const tag = row.encrypted.subarray(12, 28);
    const ct = row.encrypted.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(out.toString("utf8"));
  } finally {
    dek.fill(0);
  }
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A4.2: `sso-storage.ts` — BA adapter for `sso_providers`

**Files:**
- Create: `apps/server/src/modules/auth/sso-storage.ts`
- Test: `apps/server/src/modules/auth/__tests__/sso-storage.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { ssoStorageFor } from "../sso-storage";

describe("sso-storage", () => {
  it("encrypts oidcConfig before persisting", async () => {
    const storage = ssoStorageFor({ db: testDb });
    await storage.create({ organizationId: "o_1", providerId: "google", issuer: "https://accounts.google.com", domain: "acme.com", oidcConfig: { clientId: "x", clientSecret: "y" } });
    const row = await testDb.execute(sql`SELECT oidc_config_encrypted FROM sso_providers WHERE provider_id='google'`);
    expect(row.rows[0]!.oidc_config_encrypted).toBeInstanceOf(Buffer);
    expect(row.rows[0]!.oidc_config_encrypted.length).toBeGreaterThan(64);
  });
  it("decrypts on findById", async () => {
    const storage = ssoStorageFor({ db: testDb });
    const created = await storage.create({ organizationId: "o_1", providerId: "google", issuer: "x", domain: "acme.com", oidcConfig: { clientId: "x", clientSecret: "y" } });
    const back = await storage.findById(created.id);
    expect(back?.oidcConfig).toEqual({ clientId: "x", clientSecret: "y" });
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { ssoProviders } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { encodeOidcConfig, decodeOidcConfig } from "./oidc-config-codec";

export function ssoStorageFor(deps: { db: DrizzleClient }) {
  return {
    async create(input: { organizationId: string; providerId: string; issuer: string; domain: string; oidcConfig: object }) {
      const { encrypted, edek, kekVersion } = await encodeOidcConfig(input.oidcConfig, input.organizationId);
      const [row] = await deps.db.insert(ssoProviders).values({
        organizationId: input.organizationId,
        providerId: input.providerId,
        issuer: input.issuer,
        domain: input.domain,
        oidcConfigEncrypted: encrypted,
        oidcConfigEdek: edek,
        kekVersion,
      }).returning();
      return row;
    },
    async findById(id: string) {
      const [row] = await deps.db.select().from(ssoProviders).where(eq(ssoProviders.id, id)).limit(1);
      if (!row) return null;
      const oidcConfig = await decodeOidcConfig({ encrypted: row.oidcConfigEncrypted, edek: row.oidcConfigEdek, kekVersion: row.kekVersion }, row.organizationId);
      return { ...row, oidcConfig };
    },
    async findByOrgAndProvider(orgId: string, providerId: string) { /* similar */ },
  };
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A4.3: Plug `sso()` into the BA factory with `organizationProvisioning`

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts`
- Test: `apps/server/src/modules/auth/__tests__/sso-plugin-mount.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { createAuth } from "../instance";

describe("sso plugin mount", () => {
  it("exposes /api/auth/sso/register", async () => {
    const auth = createAuth(makeDeps({}));
    const res = await auth.handler(new Request("https://acme.app.example.com/api/auth/sso/register", { method: "OPTIONS" }));
    expect(res.status).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { sso } from "@better-auth/sso";

// inside createAuth(...).plugins:
sso({
  trustEmailVerified: true,
  organizationProvisioning: {
    disabled: false,
    defaultRole: "member",
    getRole: ({ user, organization }) => {
      // Document the link rule (see Task A4.4). Default "member" otherwise.
      return "member";
    },
  },
}),
```

Note: BA's `sso` plugin still owns its own DB rows; A4.2 storage is invoked only via the BA `databaseHooks.ssoProvider.create.before` to intercept the cleartext config before persistence. Hook into:

```ts
databaseHooks: {
  ssoProvider: {
    create: {
      before: async (input, ctx) => {
        const { encrypted, edek, kekVersion } = await encodeOidcConfig(input.oidcConfig, input.organizationId);
        return { data: { ...input, oidcConfigEncrypted: encrypted, oidcConfigEdek: edek, kekVersion, oidcConfig: undefined } };
      },
    },
  },
},
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A4.4: Auto-link rule (D8) tests + implementation

**Files:**
- Create: `apps/server/src/modules/auth/sso-link-rules.ts`
- Test: `apps/server/src/modules/auth/__tests__/sso-link-rules.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { shouldAutoLink } from "../sso-link-rules";

describe("shouldAutoLink", () => {
  it("yes when emailVerified + existing membership + domainVerified", () => {
    expect(shouldAutoLink({ emailVerified: true, hasMembership: true, domainVerified: true })).toBe(true);
  });
  it("no when emailVerified=false", () => {
    expect(shouldAutoLink({ emailVerified: false, hasMembership: true, domainVerified: true })).toBe(false);
  });
  it("no when no existing membership", () => {
    expect(shouldAutoLink({ emailVerified: true, hasMembership: false, domainVerified: true })).toBe(false);
  });
  it("no when domain not verified", () => {
    expect(shouldAutoLink({ emailVerified: true, hasMembership: true, domainVerified: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
export function shouldAutoLink(input: { emailVerified: boolean; hasMembership: boolean; domainVerified: boolean }): boolean {
  return input.emailVerified && input.hasMembership && input.domainVerified;
}
```

Wire it inside the SSO plugin's user-link hook (BA exposes a callback per `@better-auth/sso` docs in 1.6.x — confirm exact name during Phase-0 spike #4).

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A4.5: SSO callback path lives only at `/api/auth/sso/callback/:providerId`

**Files:**
- Modify: `apps/server/src/server.ts` (ensure no other `/sso/callback` handler exists)
- Test: `apps/server/src/__tests__/sso-callback-routing.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";

describe("sso callback routing", () => {
  it("only /api/auth/sso/callback/:providerId is registered", async () => {
    const routes = listRegisteredRoutes();    // helper that enumerates Hono router state
    expect(routes.filter((r) => r.path.includes("/sso/callback"))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Remove any prior `/sso/callback` route or alias**

Audit `apps/server/src/server.ts` and `routers/`. Delete duplicates.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A4.6: `/api/tenancy/current` final shape (D78)

**Files:**
- Create: `apps/server/src/modules/tenancy/current.ts`
- Modify: `apps/server/src/server.ts` (mount route)
- Test: `apps/server/src/modules/tenancy/__tests__/current.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";

describe("/api/tenancy/current", () => {
  it("returns the expected shape", async () => {
    await seedOrganization({ id: "o_1", slug: "acme", enforceSSO: true, branding: { logoVersion: 3, primaryColor: "#abc", appName: "Acme" } });
    const s = await startTestServer();
    const res = await fetch(`http://localhost:${s.port}/api/tenancy/current`, { headers: { Host: "acme.app.example.com" } });
    expect(await res.json()).toMatchObject({
      organizationId: "o_1", slug: "acme", host: "acme.app.example.com", kind: "subdomain",
      enforceSSO: true, branding: { logoVersion: 3, primaryColor: "#abc", appName: "Acme" },
    });
    await s.close();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

const responseSchema = z.object({
  organizationId: z.string(),
  slug: z.string().nullable(),
  host: z.string(),
  kind: z.enum(["subdomain", "custom"]),
  enforceSSO: z.boolean(),
  branding: z.object({ logoVersion: z.number().int().nonnegative(), primaryColor: z.string(), appName: z.string() }),
  logoUrl: z.string().nullable(),
});

export const currentTenancyRouter = new OpenAPIHono<Env>().openapi(
  createRoute({ method: "get", path: "/", responses: { 200: { content: { "application/json": { schema: responseSchema } }, description: "Current tenant" } } }),
  (c) => {
    const t = c.var.tenant;
    if (!t) return c.notFound();
    return c.json({
      organizationId: t.organizationId,
      slug: t.slug,
      host: t.host,
      kind: t.kind,
      enforceSSO: t.enforceSSO,
      branding: c.var.branding,
      logoUrl: c.var.branding.logoVersion ? `https://${process.env.BRANDING_HOST}/${t.organizationId}/logo.${c.var.branding.logoVersion}.webp` : null,
    });
  },
);
```

Mount at `baseApp.route("/api/tenancy/current", currentTenancyRouter)`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A4.7: Tenant-scope `findById` tightening (security)

**Security fix — MUST land before A6 begins.** Today `apps/server/src/modules/auth/sso-storage.ts:findById(id)` accepts no `organizationId`. While `unbindDek` prevents cross-tenant decryption (the DEK won't unwrap), the surrounding row metadata (issuer, domain, kekVersion, encrypted bytes) is still returned across tenant boundaries. Tighten the signature to require the caller's organization scope.

**Files:**
- Modify: `apps/server/src/modules/auth/sso-storage.ts` — `findById(id: string, organizationId: string)`; return `null` when the row's `organizationId` doesn't match.
- Modify: `apps/server/src/modules/auth/__tests__/sso-storage.test.ts`

- [ ] **Step 1: Failing tests**
  - Cross-org call: row exists under `o_1`; `findById(id, "o_2")` returns `null`.
  - Adversarial id: even if a caller crafts an `id` belonging to a different org, `findById` refuses (returns `null` without throwing, no metadata leaked).
  - Same-org call: row exists under `o_1`; `findById(id, "o_1")` returns the decrypted row.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
async findById(id: string, organizationId: string) {
  const [row] = await deps.db.select().from(ssoProviders)
    .where(and(eq(ssoProviders.id, id), eq(ssoProviders.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const oidcConfig = await decodeOidcConfig(
    { encrypted: row.oidcConfigEncrypted, edek: row.oidcConfigEdek, kekVersion: row.kekVersion },
    row.organizationId,
  );
  return { ...row, oidcConfig };
}
```

- [ ] **Step 4: Update every call-site** to pass the tenant-scoped `organizationId` (BA SSO hook context provides it; admin paths get it from the request principal).

- [ ] **Step 5: Run tests + lint**

- [ ] **Step 6: Self-review**

## Exit criteria

- [ ] OIDC client secret persisted as envelope-encrypted bytea; never logged plaintext.
- [ ] BA SSO plugin mounted; `/api/auth/sso/register` reachable; `/api/auth/sso/callback/:providerId` is the ONLY sso-callback route.
- [ ] `shouldAutoLink` unit tested across all 4 truth-table cells.
- [ ] `/api/tenancy/current` returns the spec D78 shape.
- [ ] `sso-storage.findById(id, organizationId)` rejects cross-org reads (A4.7).
- [ ] No `any`; vault adapter mocked in tests via `fakeVault()`.
