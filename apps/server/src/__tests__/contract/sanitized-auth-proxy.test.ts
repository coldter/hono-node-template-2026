/**
 * End-to-end contract tests for the sanitized auth-proxy boundary. Drives
 * `app.request(...)` through the production middleware chain and asserts
 * the BA-served Request still satisfies the security invariants when
 * poisoned headers slip in. Unit-level coverage lives at
 * `apps/server/src/middlewares/__tests__/auth-proxy.contract.test.ts`.
 *
 * Test seam:
 *  - `apps/server/tests/setup.ts` globally mocks `@repo/tenancy` with
 *    pass-through stubs. `vi.unmock("@repo/tenancy")` here lets the real
 *    `tenantMiddleware` and `hostHeaderGuard` run; the tenancy cache is
 *    pre-seeded so resolution short-circuits without a DB lookup.
 *  - `@/modules/auth/instance` is mocked so `auth.handler` returns an echo
 *    response that carries the request's URL, Host, and proxy-forwarded
 *    headers. The test asserts the echo to prove the proxy stripped/pinned
 *    correctly.
 */

import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@repo/tenancy");

type EchoBody = {
  ok: boolean;
  url: string;
  host: string | null;
  xfHost: string | null;
  xfProto: string | null;
  xfFor: string | null;
  forwarded: string | null;
  cfConnectingIp: string | null;
  xRealIp: string | null;
  cookie: string | null;
};

vi.mock("@/modules/auth/instance", () => ({
  createAuth: () => ({
    api: { getSession: async () => null },
    handler: (req: Request) => {
      const body: EchoBody = {
        ok: true,
        url: req.url,
        host: req.headers.get("host"),
        xfHost: req.headers.get("x-forwarded-host"),
        xfProto: req.headers.get("x-forwarded-proto"),
        xfFor: req.headers.get("x-forwarded-for"),
        forwarded: req.headers.get("forwarded"),
        cfConnectingIp: req.headers.get("cf-connecting-ip"),
        xRealIp: req.headers.get("x-real-ip"),
        cookie: req.headers.get("cookie"),
      };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    },
  }),
}));

// Audit-context is a no-op for these tests: it pulls `c.req.raw` for its
// own purposes and we want the proxy to be the terminal observable handler.
vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

describe("sanitized auth-proxy end-to-end", () => {
  let appModule: typeof import("@/routers/main");
  let serverModule: typeof import("@/server");

  beforeEach(async () => {
    vi.resetModules();
    serverModule = await import("@/server");
    appModule = await import("@/routers/main");

    // Two seeded tenants for the cross-tenant case. Pre-seeding the
    // tenancy cache bypasses the DB while letting the REAL tenant
    // middleware resolve hosts.
    serverModule.tenancyCache.set("acme.app.localhost", {
      kind: "found",
      tenant: {
        organizationId: "org_test_acme",
        slug: "acme",
        host: "acme.app.localhost",
        kind: "subdomain",
        enforceSSO: false,
        sessionVersion: 0,
        suspendedAt: null,
        deletedAt: null,
        branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
      },
    });
    serverModule.tenancyCache.set("globex.app.localhost", {
      kind: "found",
      tenant: {
        organizationId: "org_test_globex",
        slug: "globex",
        host: "globex.app.localhost",
        kind: "subdomain",
        enforceSSO: false,
        sessionVersion: 0,
        suspendedAt: null,
        deletedAt: null,
        branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
      },
    });
  });

  it("ignores a spoofed X-Forwarded-Host and pins Host to the resolved tenant", async () => {
    const res = await appModule.app.request(
      "https://acme.app.localhost/api/auth/get-session",
      {
        headers: {
          host: "acme.app.localhost",
          "x-forwarded-host": "attacker.example.com",
        },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as EchoBody;
    // BA saw the pinned tenant host, not the attacker's spoofed value.
    expect(body.host).toBe("acme.app.localhost");
    expect(body.xfHost).toBeNull();
    // The URL itself is unchanged (the sanitizer rebuilds Request with the
    // same URL); what matters is that no attacker.example.com reference
    // survives anywhere BA would consult for baseURL derivation.
    expect(body.url).toContain("acme.app.localhost");
    expect(body.url).not.toContain("attacker.example.com");
  });

  it("ignores a spoofed X-Forwarded-Proto", async () => {
    const res = await appModule.app.request(
      "https://acme.app.localhost/api/auth/get-session",
      {
        headers: {
          host: "acme.app.localhost",
          "x-forwarded-proto": "http",
        },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as EchoBody;
    // BA must not see the spoofed proto — its cookie/CSRF logic would key
    // off it and downgrade Secure cookies. The sanitizer strips it before
    // BA's handler runs.
    expect(body.xfProto).toBeNull();
    // URL scheme matches what the request actually arrived as.
    expect(body.url.startsWith("https://")).toBe(true);
  });

  it("strips all six known proxy-supplied origin headers", async () => {
    const res = await appModule.app.request(
      "https://acme.app.localhost/api/auth/get-session",
      {
        headers: {
          host: "acme.app.localhost",
          "x-forwarded-host": "attacker.example.com",
          "x-forwarded-proto": "http",
          "x-forwarded-for": "1.2.3.4",
          forwarded: "for=1.2.3.4;host=attacker.example.com",
          "cf-connecting-ip": "1.2.3.4",
          "x-real-ip": "1.2.3.4",
        },
      }
    );
    // BA still served the request (not a 421 Misdirected, not a 5xx
    // from a confused URL resolver). All six STRIPPED_HEADERS are absent.
    expect(res.status).toBe(200);
    const body = (await res.json()) as EchoBody;
    expect(body.xfHost).toBeNull();
    expect(body.xfProto).toBeNull();
    expect(body.xfFor).toBeNull();
    expect(body.forwarded).toBeNull();
    expect(body.cfConnectingIp).toBeNull();
    expect(body.xRealIp).toBeNull();
    expect(body.host).toBe("acme.app.localhost");
  });

  it("forwards a session cookie verbatim but tenancy resolution binds it to its target host", async () => {
    // Cross-tenant isolation: a cookie issued for `acme.app.localhost`
    // accompanies a request whose Host targets `globex.app.localhost`.
    // The proxy itself does not interpret cookies (BA does), but the
    // chain is wired so that `tenantMiddleware` resolves from the
    // connection-level Host. The cookie reaches BA UNDER THE GLOBEX
    // tenant — BA's session table is scoped per-organization, so it
    // would not honor an acme session under globex.
    //
    // The contract-level assertion the proxy guarantees: the resolved
    // host the BA handler sees IS globex, not acme. Authorisation of
    // the cookie itself is BA's job; here we prove the proxy hands BA
    // the request bound to the host the connection actually arrived on.
    const res = await appModule.app.request(
      "https://globex.app.localhost/api/auth/get-session",
      {
        headers: {
          host: "globex.app.localhost",
          cookie: "ba_session=acme-issued-token; Path=/",
        },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as EchoBody;
    expect(body.host).toBe("globex.app.localhost");
    // Cookie reaches BA verbatim — BA's session lookup will reject it
    // because the org_test_globex tenant has no matching session row.
    expect(body.cookie).toContain("ba_session=acme-issued-token");
  });

  it("handles an OPTIONS preflight cleanly without 5xx", async () => {
    const res = await appModule.app.request(
      "https://acme.app.localhost/api/auth/get-session",
      {
        method: "OPTIONS",
        headers: {
          host: "acme.app.localhost",
          origin: "https://acme.app.localhost",
          "access-control-request-method": "GET",
          "access-control-request-headers": "content-type",
          "x-forwarded-host": "attacker.example.com",
        },
      }
    );
    // Whatever BA / the chain decides for preflight (200, 204, even 401),
    // it must NOT be a 5xx caused by the proxy mis-handling the request,
    // and the spoofed X-Forwarded-Host must not have leaked through.
    expect(res.status).toBeLessThan(500);
    if (res.headers.get("content-type")?.includes("application/json")) {
      const body = (await res.json()) as EchoBody;
      expect(body.xfHost).toBeNull();
      expect(body.host).toBe("acme.app.localhost");
    }
  });
});
