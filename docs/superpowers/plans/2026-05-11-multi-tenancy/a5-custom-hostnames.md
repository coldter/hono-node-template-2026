# A5 — Caddy Custom Hostnames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the 6-state custom-hostname lifecycle backed by Caddy 2.11.2 on-demand TLS + `permission http`, with DoH TXT verification (Cloudflare DoH) and a Hatchet 60s reconciler.

**Architecture:** `apps/server/src/modules/tenancy/` owns four request handlers plus `/caddy/ask`. The reconciler is a Hatchet scheduled workflow. The Caddy ask endpoint runs on the same single non-superuser DB user as the rest of the app; it calls a single-purpose sanctioned read function (`lookupCustomHostnameLifecycle(host)`) that projects only `lifecycle_status` and binds the host parameter safely. The handler is per-source-IP rate-limited and bound to the internal Docker network.

**Tech Stack:** Caddy `2.11.2`, Hatchet (`@hatchet-dev/typescript-sdk@^1.22.1`), `tangerine` (DoH), `pg` `^8.20.0`.

**References:** spec § 04; decisions ND1, ND2, ND9; spec § 08 § Application-Layer Tenant Scoping (Caddy `ask` path).

---

## Task A5.1: Lifecycle status helper + verification token

**Files:**
- Create: `apps/server/src/modules/tenancy/lifecycle-status.ts`
- Create: `apps/server/src/modules/tenancy/verification-token.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/lifecycle-status.test.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/verification-token.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { isTerminal, isReconcilable } from "../lifecycle-status";
import { generateVerificationToken } from "../verification-token";

describe("lifecycle", () => {
  it.each([
    ["pending_txt", false, true],
    ["awaiting_caddy", false, true],
    ["active", true, true],
    ["failed", false, true],
    ["removing", false, true],
    ["removed", true, false],
  ] as const)("%s terminal=%s reconcilable=%s", (s, t, r) => {
    expect(isTerminal(s)).toBe(t);
    expect(isReconcilable(s)).toBe(r);
  });
});

describe("verification token", () => {
  it("starts with vtok_ and is unique across 100 calls", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateVerificationToken()));
    expect(tokens.size).toBe(100);
    for (const t of tokens) expect(t.startsWith("vtok_")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import type { CustomHostnameLifecycle } from "@repo/db/schema";

const TERMINAL = new Set<CustomHostnameLifecycle>(["active", "removed"]);
const NON_RECONCILABLE = new Set<CustomHostnameLifecycle>(["removed"]);
export const isTerminal = (s: CustomHostnameLifecycle) => TERMINAL.has(s);
export const isReconcilable = (s: CustomHostnameLifecycle) => !NON_RECONCILABLE.has(s);
```

```ts
import { generatePrefixedCuid, ID_PREFIXES } from "@repo/db/ids";
export const generateVerificationToken = () => generatePrefixedCuid(ID_PREFIXES.verificationToken);
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A5.2: TXT verification via DoH (`tangerine`)

**Files:**
- Create: `apps/server/src/modules/tenancy/txt-verification.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/txt-verification.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { verifyTxtRecord } from "../txt-verification";

describe("verifyTxtRecord", () => {
  it("ok when one TXT matches the expected token", async () => {
    const fakeResolve = vi.fn().mockResolvedValue([["vtok_match"], ["other"]]);
    const r = await verifyTxtRecord("app.acme.com", "vtok_match", { resolveTxt: fakeResolve, label: "_template-verify" });
    expect(r).toEqual({ ok: true });
    expect(fakeResolve).toHaveBeenCalledWith("_template-verify.app.acme.com");
  });
  it("no_record on NXDOMAIN", async () => {
    const fakeResolve = vi.fn().mockRejectedValue({ code: "ENOTFOUND" });
    expect(await verifyTxtRecord("x", "v", { resolveTxt: fakeResolve, label: "_template-verify" })).toEqual({ ok: false, reason: "no_record" });
  });
  it("mismatch when no record matches", async () => {
    const fakeResolve = vi.fn().mockResolvedValue([["other"]]);
    expect(await verifyTxtRecord("x", "v", { resolveTxt: fakeResolve, label: "_template-verify" })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("resolver_error on throw", async () => {
    const fakeResolve = vi.fn().mockRejectedValue(new Error("timeout"));
    expect(await verifyTxtRecord("x", "v", { resolveTxt: fakeResolve, label: "_template-verify" })).toEqual({ ok: false, reason: "resolver_error" });
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
export type TxtVerificationResult = { ok: true } | { ok: false; reason: "no_record" | "mismatch" | "resolver_error" };

export async function verifyTxtRecord(
  hostname: string, expected: string,
  deps: { resolveTxt: (name: string) => Promise<string[][]>; label: string },
): Promise<TxtVerificationResult> {
  const name = `${deps.label}.${hostname}`;
  try {
    const records = await deps.resolveTxt(name);
    if (!records || records.length === 0) return { ok: false, reason: "no_record" };
    for (const r of records) if (r.join("") === expected) return { ok: true };
    return { ok: false, reason: "mismatch" };
  } catch (e: unknown) {
    // boundary: DNS errors are heterogeneous; we coerce.
    const err = e as { code?: string };
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") return { ok: false, reason: "no_record" };
    return { ok: false, reason: "resolver_error" };
  }
}
```

The runtime `resolveTxt` will be a thin wrapper around `tangerine`'s `Resolver.resolveTxt`. Wire it in the service layer (A5.4).

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A5.3: `tangerine` DoH adapter

**Files:**
- Create: `apps/server/src/modules/tenancy/doh-resolver.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/doh-resolver.test.ts` (smoke against a real public DoH or skipped in CI)

- [ ] **Step 1: Failing test** — verify the adapter has the expected shape; skip live network in CI.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { Tangerine } from "tangerine";
const tg = new Tangerine({ servers: ["1.1.1.1", "1.0.0.1", "dns.google"], timeout: 2000, tries: 3 });
export const resolveTxt = (name: string) => tg.resolveTxt(name);
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A5.4: Service `customHostnameService` — request + verifyTxt + list + remove

**Files:**
- Create: `apps/server/src/modules/tenancy/custom-hostname-service.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/custom-hostname-service.test.ts`

- [ ] **Step 1: Failing test**

```ts
describe("customHostnameService.request", () => {
  it("inserts pending_txt row with token", async () => {
    const svc = customHostnameService({ db, txtLabel: "_template-verify", cnameTarget: "tenants.example.com" });
    const row = await svc.request({ orgId: "o_1", hostname: "app.acme.com" });
    expect(row.lifecycleStatus).toBe("pending_txt");
    expect(row.verificationToken).toMatch(/^vtok_/);
  });
  it("rejects when org has >= 10 pending rows", async () => { /* ... */ });
});

describe("customHostnameService.verifyTxt", () => {
  it("flips to awaiting_caddy on DoH success", async () => {
    const svc = customHostnameService({ db, resolveTxt: async () => [["vtok_x"]], txtLabel: "_template-verify", cnameTarget: "tenants.example.com" });
    // seed row with token "vtok_x"
    const updated = await svc.verifyTxt({ id: "tnh_x" });
    expect(updated.lifecycleStatus).toBe("awaiting_caddy");
  });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
export function customHostnameService(deps: {
  db: DrizzleClient;
  resolveTxt?: (name: string) => Promise<string[][]>;
  txtLabel: string;
  cnameTarget: string;
  invalidator: Invalidator;
}) {
  return {
    async request(input: { orgId: string; hostname: string }) {
      // rate-limit checks
      const pending = await deps.db.select().from(tenantCustomHostnames).where(and(eq(tenantCustomHostnames.organizationId, input.orgId), eq(tenantCustomHostnames.lifecycleStatus, "pending_txt")));
      if (pending.length >= 10) throw new BadRequestError("max_pending");
      const token = generateVerificationToken();
      const [row] = await deps.db.insert(tenantCustomHostnames).values({ organizationId: input.orgId, hostname: input.hostname, verificationToken: token }).returning();
      return row;
    },
    async verifyTxt(input: { id: string }) {
      const [row] = await deps.db.select().from(tenantCustomHostnames).where(eq(tenantCustomHostnames.id, input.id)).limit(1);
      if (!row) throw new NotFoundError();
      const result = await verifyTxtRecord(row.hostname, row.verificationToken, { resolveTxt: deps.resolveTxt ?? resolveTxt, label: deps.txtLabel });
      if (!result.ok) throw new BadRequestError(result.reason);
      const [updated] = await deps.db.update(tenantCustomHostnames)
        .set({ lifecycleStatus: "awaiting_caddy", verificationVerifiedAt: new Date() })
        .where(eq(tenantCustomHostnames.id, input.id))
        .returning();
      await deps.invalidator.bumpVersion(updated.hostname);
      return updated;
    },
    async list(orgId: string) { /* select where organization_id */ },
    async remove(id: string) {
      const [updated] = await deps.db.update(tenantCustomHostnames).set({ lifecycleStatus: "removing" }).where(eq(tenantCustomHostnames.id, id)).returning();
      await deps.invalidator.bumpVersion(updated.hostname);
      return updated;
    },
  };
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A5.5: HTTP handlers (`apps/server/src/modules/tenancy/routes.ts`)

**Files:**
- Create: `apps/server/src/modules/tenancy/routes.ts`
- Create: `apps/server/src/modules/tenancy/schema.ts` (Zod)
- Modify: `apps/server/src/server.ts` (mount)
- Test: `apps/server/src/modules/tenancy/__tests__/routes.test.ts`

- [ ] **Step 1: Failing test** — POST / GET / DELETE matrix.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** OpenAPIHono routes, each requiring `c.var.tenant` and an org-member assertion (existing `@repo/authorization` `Drizzle` predicate). Bodies validated via Zod.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A5.6: `/caddy/ask` endpoint

**Files:**
- Create: `apps/server/src/modules/tenancy/caddy-ask.ts`
- Create: `apps/server/src/modules/tenancy/lookup-custom-hostname-lifecycle.ts` (sanctioned single-purpose read)
- Modify: `apps/server/src/server.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/caddy-ask.test.ts`
- Test: `apps/server/src/modules/tenancy/__tests__/lookup-custom-hostname-lifecycle.test.ts`

The handler runs on the same single non-superuser DB user as the rest of the app — there is no separate `ops_lookup_role` and no second `pg.Pool`. Isolation is structural: a single-purpose `lookupCustomHostnameLifecycle(host)` function is the only sanctioned reader for this path; it projects only `lifecycle_status`, binds the host parameter safely, and returns `"granted"` or `"denied"`. Callers cannot reach any other column, any other table, or any tenant identifier through this function.

- [ ] **Step 1: Failing test (sanctioned read)**

```ts
// apps/server/src/modules/tenancy/__tests__/lookup-custom-hostname-lifecycle.test.ts
import { describe, it, expect } from "vitest";
import { lookupCustomHostnameLifecycle } from "../lookup-custom-hostname-lifecycle";

describe("lookupCustomHostnameLifecycle", () => {
  it("granted for awaiting_caddy / active", async () => {
    // seed + assert "granted"
  });
  it("denied for pending_txt / failed / removing / removed / unknown", async () => {
    // seed + assert "denied"
  });
  it("binds the host parameter safely (no SQL injection surface)", async () => {
    // pass `' OR 1=1 --` and assert "denied"
  });
});
```

- [ ] **Step 2: Failing test (HTTP handler)**

```ts
describe("/caddy/ask", () => {
  it("200 for awaiting_caddy and active", async () => {
    await seedHostname({ hostname: "app.acme.com", lifecycleStatus: "awaiting_caddy" });
    const s = await startTestServer();
    expect((await fetch(`http://localhost:${s.port}/caddy/ask?domain=app.acme.com`)).status).toBe(200);
    await s.close();
  });
  it("404 for pending_txt, removing, removed, failed, unknown", async () => { /* ... */ });
  it("400 on missing/too-long domain", async () => { /* ... */ });
  it("per-source-IP rate limit returns 429 after burst", async () => { /* ... */ });
});
```

- [ ] **Step 3: Run, watch fail**

- [ ] **Step 4: Implement the sanctioned read**

```ts
// apps/server/src/modules/tenancy/lookup-custom-hostname-lifecycle.ts
import { eq, sql } from "drizzle-orm";
import type { DrizzleClient } from "@repo/db";
import { tenantCustomHostnames } from "@repo/db/schema";

export type LifecycleAskResult = "granted" | "denied";

/**
 * Sanctioned single-purpose read for the Caddy `/caddy/ask` path.
 *
 * Projects ONLY `lifecycle_status`. Returns `"granted"` for `awaiting_caddy` /
 * `active`, `"denied"` for every other state (including unknown host).
 *
 * This is the only function in the app permitted to read
 * `tenant_custom_hostnames` without a tenant identifier in the WHERE clause —
 * the structural justification is that the projection exposes no tenant data.
 * Every other reader must gate on `organizationId` per spec § 08 §
 * Application-Layer Tenant Scoping.
 */
export async function lookupCustomHostnameLifecycle(
  db: DrizzleClient,
  hostname: string,
): Promise<LifecycleAskResult> {
  const rows = await db
    .select({ lifecycleStatus: tenantCustomHostnames.lifecycleStatus })
    .from(tenantCustomHostnames)
    .where(eq(tenantCustomHostnames.hostname, hostname))
    .limit(1);
  const status = rows[0]?.lifecycleStatus;
  if (status === "awaiting_caddy" || status === "active") return "granted";
  return "denied";
}
```

- [ ] **Step 5: Implement the handler**

```ts
// apps/server/src/modules/tenancy/caddy-ask.ts
import type { Context } from "hono";
import { db } from "@repo/db";
import { lookupCustomHostnameLifecycle } from "./lookup-custom-hostname-lifecycle";

export const caddyAskHandler = async (c: Context) => {
  const domain = c.req.query("domain")?.toLowerCase();
  if (!domain || domain.length > 253) return c.body(null, 400);
  const result = await lookupCustomHostnameLifecycle(db, domain);
  return c.body(null, result === "granted" ? 200 : 404);
};

// Mount BEFORE tenantMiddleware (which would 404 on the host caddy-stub uses).
// Apply a per-source-IP rate limit middleware to this route only.
baseApp.get("/caddy/ask", caddyAskRateLimit, caddyAskHandler);
```

Important: this handler is mounted on a route that bypasses `tenantMiddleware`. It must be reachable on the internal Docker network only — the production Caddyfile does not proxy `/caddy/ask` to the internet. The per-source-IP rate limiter further dampens any abuse window if the network boundary is misconfigured.

- [ ] **Step 6: Run tests + lint**

- [ ] **Step 7: Self-review**

Verify: single DB user; no second `pg.Pool`; `lookupCustomHostnameLifecycle` is the only reader of `tenant_custom_hostnames` that does not gate on `organizationId`; rate limiter is applied; the handler is reachable only on the internal network.

## Task A5.7: Hatchet reconciler workflow

**Files:**
- Create: `apps/server/src/workflows/reconcile-hostnames.ts`
- Modify: `apps/server/src/lib/hatchet.ts` (register workflow)
- Test: `apps/server/src/workflows/__tests__/reconcile-hostnames.test.ts`

- [ ] **Step 1: Failing test**

```ts
describe("reconcile-hostnames", () => {
  it("advances pending_txt → failed after 7 days", async () => {
    await seedHostname({ id: "tnh_old", lifecycleStatus: "pending_txt", createdAt: new Date(Date.now() - 8 * 86400_000) });
    await reconcileOne("tnh_old", { db, resolveTxt: async () => [], invalidator });
    const r = await loadHostname("tnh_old");
    expect(r.lifecycleStatus).toBe("failed");
  });
  it("re-DoHs pending_txt and flips on success", async () => { /* ... */ });
  it("flips removing → removed after Caddy storage delete", async () => { /* ... */ });
});
```

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement**

```ts
import { hatchet } from "@/lib/hatchet";

export const reconcileHostnames = hatchet.workflow({
  name: "reconcile-hostnames",
  on: { cron: "* * * * *" },        // 1-min minimum
});

reconcileHostnames.task({
  name: "scan",
  fn: async () => {
    const rows = await db.select().from(tenantCustomHostnames).where(and(
      inArray(tenantCustomHostnames.lifecycleStatus, ["pending_txt","awaiting_caddy","failed","removing"]),
      or(isNull(tenantCustomHostnames.lastReconciledAt), lt(tenantCustomHostnames.lastReconciledAt, sql`now() - interval '50 seconds'`)),
    ));
    for (const row of rows) await reconcileOne(row.id, { db, resolveTxt, invalidator });
  },
});
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task A5.8: Caddyfile + compose updates

**Files:**
- Create: `deploy/Caddyfile.prod`
- Modify: `deploy/Caddyfile` (or rename existing → `Caddyfile.simple`)
- Modify: `compose.yaml`
- Modify: `apps/server/src/env.ts` (add `CUSTOM_HOST_VERIFICATION_LABEL`, `CUSTOM_HOST_CNAME_TARGET`)
- Test: `apps/server/src/__tests__/caddy-config-contract.test.ts` (lints the Caddyfile via `caddy adapt`)

- [ ] **Step 1: Failing test** — assert `caddy adapt --config Caddyfile.prod` returns valid JSON containing the `permission` directive with our internal URL.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Author Caddyfile.prod**

```caddyfile
{
    on_demand_tls {
        permission http http://apps-server:3000/caddy/ask
        interval 2m
        burst 5
    }
}

*.{$APP_WILDCARD_HOST}, {$CUSTOM_HOST_CNAME_TARGET} {
    tls {
        dns cloudflare {env.CLOUDFLARE_DNS_TOKEN}
        on_demand
    }
    @api path /api/*
    handle @api { reverse_proxy apps-server:3000 }
    handle { root * /srv/app; try_files {path} /index.html; file_server }
}

{$ADMIN_HOST} {
    tls { dns cloudflare {env.CLOUDFLARE_DNS_TOKEN} }
    @api path /api/*
    handle @api { reverse_proxy apps-admin-server:3100 }
    handle { root * /srv/admin; try_files {path} /index.html; file_server }
}
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Exit criteria

- [ ] All 6 lifecycle states transition per spec table.
- [ ] DoH TXT verification works against an injected resolver (and against a live DoH endpoint in a smoke test).
- [ ] `/caddy/ask` returns 200 / 404 / 400 per matrix; uses the single sanctioned `lookupCustomHostnameLifecycle` reader on the single app DB user (no `ops_lookup_role`); per-source-IP rate limit returns 429 on burst.
- [ ] Hatchet reconciler runs every minute (UTC).
- [ ] Caddyfile.prod adapts cleanly via `caddy adapt`.
- [ ] Rate limits (10 pending, 50/24h) enforced per org.
