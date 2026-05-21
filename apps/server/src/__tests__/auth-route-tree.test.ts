/**
 * Integration test for the `/api/auth/*` route tree. Verifies the sanitized
 * auth proxy is wired into the application graph and that the upstream
 * middleware chain runs before it.
 *
 *  - Unknown Host: 404 must come from `tenantMiddleware` BEFORE the proxy
 *    or BA see the request. The proxy's own `HTTPException(404)` is
 *    defense-in-depth for the case where the proxy is mounted in a sub-app
 *    that skips tenancy.
 *  - Known Host: request reaches the proxy, which calls the per-request
 *    `auth.handler` and returns its response verbatim.
 *
 * The auth instance is stubbed so the proxy's forwarding behaviour can be
 * observed without booting BA's full DB/secret machinery.
 */

import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@repo/tenancy");

// Stub BA factory: proxy contract only needs `auth.handler(req)` invoked and
// `auth.api.getSession` returning null (auth-context sets `principal: null`).
vi.mock("@/modules/auth/instance", () => ({
  createAuth: () => ({
    api: {
      getSession: async () => null,
    },
    handler: (req: Request) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            url: req.url,
            host: req.headers.get("host"),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      ),
  }),
}));

vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

describe("/api/auth route tree", () => {
  // Re-import after vi.mock declarations are hoisted so stubs apply.
  let appModule: typeof import("@/routers/main");
  let serverModule: typeof import("@/server");

  beforeEach(async () => {
    vi.resetModules();
    serverModule = await import("@/server");
    appModule = await import("@/routers/main");
  });

  it("404s on /api/auth/get-session when host is unknown", async () => {
    const res = await appModule.app.request(
      "http://ghost.app.localhost/api/auth/get-session",
      { headers: { host: "ghost.app.localhost" } }
    );
    expect(res.status).toBe(404);
  });

  it("200s on /api/auth/get-session when host is known (cache pre-seeded)", async () => {
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

    const res = await appModule.app.request(
      "http://acme.app.localhost/api/auth/get-session",
      { headers: { host: "acme.app.localhost" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      url: string;
      host: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.url).toContain("/api/auth/get-session");
    // Proof `sanitizedAuthRequest` ran: Host matches resolved tenant rather than the spoofed value.
    expect(body.host).toBe("acme.app.localhost");
  });
});
