/**
 * Drives the production middleware chain for `/caddy/ask` end-to-end via
 * `app.request(url)`. Pins the WIRING through `chain.ts`:
 *  - `caddyAskRateLimit` precedes `caddyAsk`
 *  - both mount BEFORE `hostHeaderGuard` / `tenantMiddleware`
 *  - per-IP rate limit operates on the `x-forwarded-for` key resolved by
 *    `resolveClientIp`
 *
 * The handler's own contract is covered separately at
 * `apps/server/src/modules/tenancy/__tests__/caddy-ask.test.ts`.
 *
 * SKIP_DB seam: `vitest.config.ts` sets `SKIP_DB=true`, so the production
 * `db` import resolves to an empty object. We swap
 * `lookupCustomHostnameLifecycle` — the sanctioned single-purpose reader
 * the handler calls — with a stub that consults an in-memory map. The DB
 * layer is therefore never reached but the full chain path is exercised
 * exactly as Caddy would.
 */

import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@repo/tenancy");

// boundary: vitest hoists `vi.mock(...)` above all imports, so the factory cannot
// close over a top-level `const`. Stash the map on `globalThis` so per-test state
// is addressable from both the factory and the body.
type LifecycleResult = "granted" | "denied";
type LifecycleStore = Map<string, LifecycleResult>;
const STORE_KEY = "__caddyAskTestLifecycleStore";

// boundary: single cast site reused by the accessor and the mock factory.
function globalLifecycleSlot(): { value: LifecycleStore | undefined } {
  const g = globalThis as unknown as Record<string, LifecycleStore | undefined>;
  return {
    get value() {
      return g[STORE_KEY];
    },
    set value(next) {
      g[STORE_KEY] = next;
    },
  };
}

function lifecycleStore(): LifecycleStore {
  const slot = globalLifecycleSlot();
  let s = slot.value;
  if (!s) {
    s = new Map();
    slot.value = s;
  }
  return s;
}

vi.mock("@/modules/tenancy/lookup-custom-hostname-lifecycle", () => ({
  lookupCustomHostnameLifecycle: async (
    _db: unknown,
    hostname: string
  ): Promise<LifecycleResult> => {
    const store = globalLifecycleSlot().value;
    return store?.get(hostname) ?? "denied";
  },
}));

vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

vi.mock("@/modules/auth/instance", () => ({
  createAuth: () => ({
    api: { getSession: async () => null },
    handler: () => Promise.resolve(new Response("", { status: 200 })),
  }),
}));

const DENIED_LIFECYCLE_STATUSES = [
  "pending_txt",
  "failed",
  "removing",
  "removed",
] as const;

describe("/caddy/ask contract", () => {
  let appModule: typeof import("@/routers/main");

  beforeEach(async () => {
    vi.resetModules();
    appModule = await import("@/routers/main");
    lifecycleStore().clear();
  });

  describe("200 / 404 matrix", () => {
    it("returns 200 for an `awaiting_caddy` host", async () => {
      lifecycleStore().set("app.acme.com", "granted");
      const res = await appModule.app.request(
        "http://internal-host/caddy/ask?domain=app.acme.com",
        { headers: { "x-forwarded-for": "10.0.1.1" } }
      );
      expect(res.status).toBe(200);
    });

    it("returns 200 for an `active` host", async () => {
      lifecycleStore().set("live.acme.com", "granted");
      const res = await appModule.app.request(
        "http://internal-host/caddy/ask?domain=live.acme.com",
        { headers: { "x-forwarded-for": "10.0.1.2" } }
      );
      expect(res.status).toBe(200);
    });

    it.each(
      DENIED_LIFECYCLE_STATUSES
    )("returns 404 for a host in `%s`", async (status) => {
      // Underscores fail the charset guard before the DB lookup; use hyphens.
      const label = status.replace(/_/g, "-");
      const host = `${label}.acme.com`;
      lifecycleStore().set(host, "denied");
      const res = await appModule.app.request(
        `http://internal-host/caddy/ask?domain=${host}`,
        { headers: { "x-forwarded-for": `10.0.2.${status.length}` } }
      );
      expect(res.status).toBe(404);
    });

    it("returns 404 for an unknown host (no row)", async () => {
      const res = await appModule.app.request(
        "http://internal-host/caddy/ask?domain=ghost.acme.com",
        { headers: { "x-forwarded-for": "10.0.3.1" } }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("400 (bad request)", () => {
    it("returns 400 when ?domain is missing", async () => {
      const res = await appModule.app.request(
        "http://internal-host/caddy/ask",
        { headers: { "x-forwarded-for": "10.0.4.1" } }
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid domain syntax", async () => {
      const res = await appModule.app.request(
        `http://internal-host/caddy/ask?domain=${encodeURIComponent("<script>")}`,
        { headers: { "x-forwarded-for": "10.0.4.2" } }
      );
      expect(res.status).toBe(400);
    });
  });

  describe("lazy awaiting_caddy -> active flip (deferred)", () => {
    // TODO: once `tenantMiddleware` grows a handshake-aware writer, assert
    // against `tenant_custom_hostnames.lifecycle_status` and `.last_handshake_at`.
    // Today the flip happens in the reconciler workflow, not at request time.
    it.todo(
      "flips awaiting_caddy -> active via lifecycle on the first successful handshake"
    );
  });

  describe("429 per-IP rate limit", () => {
    it("emits at least one 429 for a burst from a single IP", async () => {
      lifecycleStore().set("burst.acme.com", "granted");
      const ip = "203.0.113.50";

      const statuses: number[] = [];
      // Window is 5 req / 2 min; 8 from one IP exceeds it. `vi.resetModules` in beforeEach gives a clean counter.
      for (let i = 0; i < 8; i += 1) {
        const res = await appModule.app.request(
          "http://internal-host/caddy/ask?domain=burst.acme.com",
          { headers: { "x-forwarded-for": ip } }
        );
        statuses.push(res.status);
      }
      expect(statuses).toContain(429);
      expect(statuses[0]).toBe(200);
    });

    it("does not throttle distinct IPs together", async () => {
      lifecycleStore().set("shared.acme.com", "granted");
      const ipA = "1.1.1.1";
      const ipB = "2.2.2.2";

      // If the limiter keyed globally instead of per-IP, one of these bursts would 429.
      const fire = (ip: string) =>
        appModule.app.request(
          "http://internal-host/caddy/ask?domain=shared.acme.com",
          { headers: { "x-forwarded-for": ip } }
        );

      const aStatuses: number[] = [];
      const bStatuses: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        aStatuses.push((await fire(ipA)).status);
        bStatuses.push((await fire(ipB)).status);
      }
      expect(aStatuses).toEqual([200, 200, 200, 200]);
      expect(bStatuses).toEqual([200, 200, 200, 200]);
    });
  });
});
