# A3 — Better Auth Multi-Tenant Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Harden the Better Auth instance for multi-tenant operation: object-form `baseURL.allowedHosts`, dynamic `trustedOrigins(req)`, sanitized request boundary, host-only cookies, `disableSignUp`, `disableOrgCreate` plugin, session-DB storage, `enforce_sso` enforcement hook.

**Architecture:** A per-request `createAuth(deps)` factory in `apps/server/src/modules/auth/instance.ts`. Sanitization at the in-process proxy boundary strips `X-Forwarded-*` and pins `Host`. Defense-in-depth `databaseHooks` reject sign-up + org create.

**Tech Stack:** Better Auth `^1.6.10` + `@better-auth/sso` `^1.6.10`, `@repo/tenancy`.

**References:** spec § 03; decisions D11, D15, D22, D32, D65, D77.

---

## Task A3.1: `host-config.ts` helpers for BA `allowedHosts`

**Files:**
- Create: `apps/server/src/modules/auth/host-config.ts`
- Test: `apps/server/src/modules/auth/__tests__/host-config.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveAllowedHosts } from "../host-config";

describe("deriveAllowedHosts", () => {
  it("expands wildcard + admin + local-dev", () => {
    const out = deriveAllowedHosts({ wildcardSuffix: ".app.example.com", adminHost: "admin.example.com", customHosts: ["app.acme.com"], localDevHosts: ["*.lvh.me:3000"], nodeEnv: "development" });
    expect(out).toEqual(expect.arrayContaining([
      "app.example.com", "*.app.example.com", "admin.example.com", "app.acme.com", "*.lvh.me:3000",
    ]));
  });
  it("omits local-dev hosts in production", () => {
    const out = deriveAllowedHosts({ wildcardSuffix: ".app.example.com", adminHost: "admin.example.com", customHosts: [], localDevHosts: ["*.lvh.me:3000"], nodeEnv: "production" });
    expect(out).not.toContain("*.lvh.me:3000");
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
export type AllowedHostsSnapshot = Readonly<{
  wildcardSuffix: string;
  adminHost: string;
  customHosts: ReadonlyArray<string>;
  localDevHosts: ReadonlyArray<string>;
  nodeEnv: "development" | "production" | "test";
}>;

export function deriveAllowedHosts(snap: AllowedHostsSnapshot): ReadonlyArray<string> {
  const apex = snap.wildcardSuffix.replace(/^\./, "");
  const out: string[] = [apex, `*${snap.wildcardSuffix}`, snap.adminHost, ...snap.customHosts];
  if (snap.nodeEnv !== "production") out.push(...snap.localDevHosts);
  return Object.freeze(out);
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A3.2: `createAuth(deps)` factory with object-form `baseURL`

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts`
- Test: `apps/server/src/modules/auth/__tests__/instance.allowed-hosts.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { createAuth } from "../instance";

describe("createAuth allowedHosts", () => {
  it("rejects unknown host via BA handler", async () => {
    const auth = createAuth(makeDeps({ tenantHost: "acme.app.example.com" }));
    const res = await auth.handler(new Request("https://attacker.example/api/auth/get-session"));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it("accepts the resolved tenant host", async () => {
    const auth = createAuth(makeDeps({ tenantHost: "acme.app.example.com" }));
    const res = await auth.handler(new Request("https://acme.app.example.com/api/auth/get-session"));
    expect(res.status).not.toBe(421);   // BA allowedHosts rejection signal
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

In `instance.ts`, replace the existing top-level `betterAuth({...})` call with a `createAuth(deps)` factory:
```ts
export function createAuth(deps: { db: DrizzleClient; tenant: Tenant | null; allowedHostsSnapshot: AllowedHostsSnapshot; logger: Logger }) {
  const allowedHosts = [...deriveAllowedHosts(deps.allowedHostsSnapshot)];
  if (deps.tenant) allowedHosts.push(deps.tenant.host);

  return betterAuth({
    database: drizzleAdapter(deps.db, { provider: "pg", schema }),
    baseURL: { allowedHosts, protocol: "auto" },
    basePath: "/api/auth",
    advanced: { trustedProxyHeaders: false },
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { storeSessionInDatabase: true, preserveSessionInDatabase: true, cookieCache: { enabled: true, maxAge: 60 } },
    trustedOrigins: async (req) => deriveTrustedOriginsForReq(req, deps),
    databaseHooks: {
      user: { create: { before: async (user) => assertInviteFlag(user) } },
      session: { create: { before: async (session, ctx) => enforceSsoIfRequired(session, ctx, deps.db) } },
    },
    plugins: [
      adminPlugin(),
      twoFactor(),
      emailOTP(),
      openAPI(),
      sso({ trustEmailVerified: true, organizationProvisioning: { disabled: false, defaultRole: "member" } }),
      jwt({ jwt: { expirationTime: "15m", definePayload: (ctx) => buildTenantJwtPayload(ctx, deps.tenant) } }),
      disableOrgCreatePlugin(),
    ],
  });
}
```

The `deps.tenant` is per-request; the factory is invoked from a middleware that captures `c.var.tenant` and `c.var.db` (request-scoped Drizzle).

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A3.3: Dynamic `trustedOrigins(req)` keyed off `parseHostname`

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts`
- Create: `apps/server/src/modules/auth/trusted-origins.ts`
- Test: `apps/server/src/modules/auth/__tests__/trusted-origins.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveTrustedOriginsForReq } from "../trusted-origins";

describe("trustedOrigins(req)", () => {
  it("returns per-tenant origin only when host parses to subdomain/custom", async () => {
    const req = new Request("https://acme.app.example.com/api/auth/get-session");
    const out = await deriveTrustedOriginsForReq(req, makeDeps({ tenantHost: "acme.app.example.com" }));
    expect(out).toContain("https://acme.app.example.com");
  });
  it("returns only extras when host is admin", async () => {
    const req = new Request("https://admin.example.com/x");
    const out = await deriveTrustedOriginsForReq(req, makeDeps({ tenantHost: "acme.app.example.com", extras: ["https://idp.example"] }));
    expect(out).toEqual(["https://idp.example"]);
  });
  it("handles undefined req (during init)", async () => {
    const out = await deriveTrustedOriginsForReq(undefined, makeDeps({ tenantHost: "acme.app.example.com" }));
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { parseHostname } from "@repo/tenancy";

export async function deriveTrustedOriginsForReq(req: Request | undefined, deps: { tenant: Tenant | null; allowedHostsSnapshot: AllowedHostsSnapshot; extraTrustedOrigins?: ReadonlyArray<string> }): Promise<ReadonlyArray<string>> {
  if (!req) return [];
  const parsed = parseHostname(new URL(req.url).host, deps.allowedHostsSnapshot);
  if ((parsed.kind === "subdomain" || parsed.kind === "custom") && deps.tenant) {
    return [`https://${deps.tenant.host}`, ...(deps.extraTrustedOrigins ?? [])];
  }
  return deps.extraTrustedOrigins ?? [];
}
```

Wire into `instance.ts` `trustedOrigins`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A3.4: Sanitized BA proxy boundary

**Files:**
- Create: `apps/server/src/middlewares/auth-proxy.ts`
- Create: `apps/server/src/modules/auth/sanitized-request.ts`
- Test: `apps/server/src/middlewares/__tests__/auth-proxy.contract.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { sanitizedAuthRequest, STRIPPED_HEADERS } from "../../modules/auth/sanitized-request";

describe("sanitizedAuthRequest", () => {
  it.each(STRIPPED_HEADERS)("strips %s", (h) => {
    const dirty = new Request("https://acme.app.example.com/api/auth/get-session", { headers: { [h]: "evil" } });
    const clean = sanitizedAuthRequest(dirty, makeTenant({ host: "acme.app.example.com" }));
    expect(clean.headers.get(h)).toBeNull();
  });
  it("pins Host to tenant.host", () => {
    const dirty = new Request("https://acme.app.example.com/api/auth/get-session", { headers: { Host: "attacker.example" } });
    const clean = sanitizedAuthRequest(dirty, makeTenant({ host: "acme.app.example.com" }));
    expect(clean.headers.get("host")).toBe("acme.app.example.com");
  });
  it("preserves body", async () => {
    const dirty = new Request("https://x/api/auth/sign-in", { method: "POST", body: JSON.stringify({ a: 1 }), headers: { "content-type": "application/json" } });
    const clean = sanitizedAuthRequest(dirty, makeTenant({ host: "acme.app.example.com" }));
    expect(await clean.json()).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
// apps/server/src/modules/auth/sanitized-request.ts
import type { Tenant } from "@repo/tenancy";

export const STRIPPED_HEADERS = [
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-for",
  "forwarded", "cf-connecting-ip", "x-real-ip",
] as const;

export function sanitizedAuthRequest(req: Request, tenant: Tenant): Request {
  const headers = new Headers(req.headers);
  for (const h of STRIPPED_HEADERS) headers.delete(h);
  headers.set("host", tenant.host);
  return new Request(req.url, {
    method: req.method,
    headers,
    body: req.body,
    redirect: req.redirect,
    referrer: req.referrer,
    duplex: "half",
    // boundary: Request constructor type doesn't expose duplex; required for streaming bodies.
  } as RequestInit);
}
```

```ts
// apps/server/src/middlewares/auth-proxy.ts
import { createMiddleware } from "hono/factory";
import { sanitizedAuthRequest } from "@/modules/auth/sanitized-request";
import { createAuth } from "@/modules/auth/instance";

export const authProxyMiddleware = createMiddleware(async (c, next) => {
  const tenant = c.var.tenant;
  if (!tenant) return c.notFound();
  const auth = createAuth({ db: c.var.db, tenant, allowedHostsSnapshot: c.var.allowedHostsSnapshot, logger: c.var.logger });
  const cleanReq = sanitizedAuthRequest(c.req.raw, tenant);
  const res = await auth.handler(cleanReq);
  return res;
});
```

Mount under `/api/auth/*` only.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A3.5: `disableOrgCreate` plugin

**Files:**
- Create: `apps/server/src/modules/auth/plugins/disable-org-create.ts`
- Test: `apps/server/src/modules/auth/__tests__/disable-org-create.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { createAuth } from "../instance";

describe("disableOrgCreate", () => {
  it("rejects POST /organization/create", async () => {
    const auth = createAuth(makeDeps({}));
    const res = await auth.handler(new Request("https://acme.app.example.com/api/auth/organization/create", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement (BA plugin pattern)**

```ts
import type { BetterAuthPlugin } from "better-auth";

export function disableOrgCreatePlugin(): BetterAuthPlugin {
  return {
    id: "disableOrgCreate",
    hooks: {
      before: [{
        matcher: (ctx) => ctx.path.endsWith("/organization/create"),
        handler: async () => { throw new APIError("FORBIDDEN", { message: "Organization creation disabled for tenants" }); },
      }],
    },
  };
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A3.6: `enforce_sso` enforcement hook

**Files:**
- Create: `apps/server/src/modules/auth/enforce-sso.ts`
- Test: `apps/server/src/modules/auth/__tests__/enforce-sso.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { enforceSsoIfRequired } from "../enforce-sso";

describe("enforceSsoIfRequired", () => {
  it("throws when org.enforceSSO and provider=credentials", async () => {
    const db = makeDb({ organizations: { o_1: { enforceSSO: true } } });
    await expect(enforceSsoIfRequired({ activeOrganizationId: "o_1", provider: "credentials" } as any, {} as any, db)).rejects.toThrow(/SSO required/);
  });
  it("allows when org.enforceSSO=false", async () => {
    const db = makeDb({ organizations: { o_1: { enforceSSO: false } } });
    await expect(enforceSsoIfRequired({ activeOrganizationId: "o_1", provider: "credentials" } as any, {} as any, db)).resolves.not.toThrow();
  });
  it("allows when provider != credentials", async () => {
    const db = makeDb({ organizations: { o_1: { enforceSSO: true } } });
    await expect(enforceSsoIfRequired({ activeOrganizationId: "o_1", provider: "oidc" } as any, {} as any, db)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { APIError } from "better-auth/api";
import { organizations } from "@repo/db/schema";
import { eq } from "drizzle-orm";

export async function enforceSsoIfRequired(session: { activeOrganizationId?: string; provider?: string }, _ctx: unknown, db: DrizzleClient) {
  if (!session.activeOrganizationId) return;
  if (session.provider !== "credentials") return;
  const [org] = await db.select({ enforceSSO: organizations.enforceSSO }).from(organizations).where(eq(organizations.id, session.activeOrganizationId)).limit(1);
  if (org?.enforceSSO) throw new APIError("FORBIDDEN", { message: "SSO required" });
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A3.7: Wire the proxy into the route tree

**Files:**
- Modify: `apps/server/src/server.ts`
- Test: `apps/server/src/__tests__/auth-route-tree.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { startTestServer } from "./helpers/start-test-server";

describe("/api/auth route tree", () => {
  it("404s on /api/auth/get-session when host unknown", async () => {
    const s = await startTestServer();
    const r = await fetch(`http://localhost:${s.port}/api/auth/get-session`, { headers: { Host: "ghost.app.example.com" } });
    expect(r.status).toBe(404);
    await s.close();
  });
  it("200s on /api/auth/get-session when host known", async () => {
    await seedOrganization({ slug: "acme" });
    const s = await startTestServer();
    const r = await fetch(`http://localhost:${s.port}/api/auth/get-session`, { headers: { Host: "acme.app.example.com" } });
    expect(r.status).toBe(200);
    await s.close();
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Mount**

```ts
// apps/server/src/server.ts (after tenantMiddleware mount)
import { authProxyMiddleware } from "@/middlewares/auth-proxy";
baseApp.all("/api/auth/*", authProxyMiddleware);
```

Remove the old top-level `betterAuth({...})` call and the `handler.ts` handler — the proxy is the only entry.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Exit criteria

- [ ] BA `allowedHosts` rejects unknown hosts.
- [ ] `trustedOrigins(req)` returns per-tenant origin only on a parsed subdomain/custom host.
- [ ] Sanitized request strips all six listed headers; pins Host; preserves body.
- [ ] `disableOrgCreate` plugin rejects `/organization/create`.
- [ ] `enforce_sso` hook rejects credentials login when the org requires SSO.
- [ ] `/api/auth/*` route tree routes through the proxy, not directly to BA.
- [ ] No `any`. `as RequestInit` cast in sanitized-request is annotated with `// boundary:`.
