/**
 * Ordering assertions for the admin-server production middleware chain.
 * The generic well-formedness guard is unit-tested in `@repo/hono-app`;
 * this suite asserts app-specific entry ordering invariants for the
 * operator perimeter.
 */

import { describe, expect, it } from "vitest";
import { buildChain, chain, type MiddlewareChain } from "@/chain";
import type { AdminAuthInstance } from "@/modules/auth/instance";

function indexOf(c: MiddlewareChain, name: string): number {
  return c.findIndex((e) => e.name === name);
}

// boundary: chain wiring tests assert only the entry order; no BA method
// is invoked, so the empty stub stands in for the full instance shape.
const stubAuthFactory = () => ({}) as unknown as AdminAuthInstance;

describe("admin-server middleware chain", () => {
  it("seeds the request context before any consumer writes to it", () => {
    const init = indexOf(chain, "requestContextInit");
    const audit = indexOf(chain, "auditContextMiddleware");
    expect(init).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(init);
  });

  it("mounts /ping before cors so probes do not require an Origin", () => {
    const ping = indexOf(chain, "ping");
    const cors = indexOf(chain, "cors");
    expect(ping).toBeGreaterThanOrEqual(0);
    expect(ping).toBeLessThan(cors);
  });

  it("orders cors before globalRateLimit", () => {
    const cors = indexOf(chain, "cors");
    const rl = indexOf(chain, "globalRateLimit");
    expect(cors).toBeGreaterThanOrEqual(0);
    expect(rl).toBeGreaterThan(cors);
  });
});

describe("admin-server middleware chain (with BA wiring)", () => {
  it("mounts authContext after auditContext and authProxy after authContext", () => {
    // The auth surface is gated behind explicit deps so the default
    // scaffold chain stays inert; verify the wired chain satisfies the
    // operator-perimeter ordering invariants.
    const wired = buildChain({ authFactory: stubAuthFactory });
    const audit = indexOf(wired, "auditContextMiddleware");
    const authContext = indexOf(wired, "authContext");
    const authProxy = indexOf(wired, "authProxy");

    expect(audit).toBeGreaterThanOrEqual(0);
    expect(authContext).toBeGreaterThan(audit);
    expect(authProxy).toBeGreaterThan(authContext);
  });

  it("path-scopes the auth proxy to /api/auth/*", () => {
    const wired = buildChain({ authFactory: stubAuthFactory });
    const entry = wired.find((e) => e.name === "authProxy");
    expect(entry?.kind).toBe("use-path");
    if (entry?.kind === "use-path") {
      expect(entry.path).toBe("/api/auth/*");
    }
  });
});
