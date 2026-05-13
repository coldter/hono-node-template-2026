/**
 * App-specific ordering invariants for the tenant-server middleware chain.
 * The generic well-formedness guard is unit-tested in `@repo/hono-app`.
 */

import { describe, expect, it } from "vitest";
import { assertChainWellFormed, chain, type MiddlewareChain } from "@/chain";

function indexOf(c: MiddlewareChain, name: string): number {
  return c.findIndex((e) => e.name === name);
}

describe("middleware chain", () => {
  it("has unique entry names", () => {
    const names = chain.map((e) => e.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("orders tenantMiddleware before authContextMiddleware", () => {
    const tenant = indexOf(chain, "tenantMiddleware");
    const authCtx = indexOf(chain, "authContextMiddleware");
    expect(tenant).toBeGreaterThanOrEqual(0);
    expect(authCtx).toBeGreaterThan(tenant);
  });

  it("orders authContextMiddleware before authProxy", () => {
    const authCtx = indexOf(chain, "authContextMiddleware");
    const proxy = indexOf(chain, "authProxy");
    expect(authCtx).toBeGreaterThanOrEqual(0);
    expect(proxy).toBeGreaterThan(authCtx);
  });

  it("orders caddyAskRateLimit before caddyAsk handler", () => {
    const rl = indexOf(chain, "caddyAskRateLimit");
    const handler = indexOf(chain, "caddyAsk");
    expect(rl).toBeGreaterThanOrEqual(0);
    expect(handler).toBeGreaterThan(rl);
  });

  it("orders hostHeaderGuard before tenantMiddleware", () => {
    const guard = indexOf(chain, "hostHeaderGuard");
    const tenant = indexOf(chain, "tenantMiddleware");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(tenant).toBeGreaterThan(guard);
  });

  it("if devTenantHeader is present it sits between hostHeaderGuard and tenantMiddleware", () => {
    const dev = indexOf(chain, "devTenantHeader");
    if (dev === -1) {
      // Entry is chain-build-gated on ALLOW_DEV_TENANT_HEADER==="1" — absent
      // by default. The dedicated suite in dev-tenant-header.test.ts stubs
      // the env and asserts the present case.
      return;
    }
    const guard = indexOf(chain, "hostHeaderGuard");
    const tenant = indexOf(chain, "tenantMiddleware");
    expect(dev).toBeGreaterThan(guard);
    expect(dev).toBeLessThan(tenant);
  });

  it("mounts /ping before the tenancy guard so health-checks bypass tenant resolution", () => {
    const ping = indexOf(chain, "ping");
    const guard = indexOf(chain, "hostHeaderGuard");
    expect(ping).toBeGreaterThanOrEqual(0);
    expect(ping).toBeLessThan(guard);
  });

  it("every `requires` reference points at an earlier entry", () => {
    expect(() => assertChainWellFormed(chain)).not.toThrow();
  });
});
