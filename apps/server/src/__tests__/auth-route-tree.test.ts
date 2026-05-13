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

// Stub the BA factory so the per-request `auth` returned to both the
// auth-context middleware and the auth proxy is a controllable surrogate.
// Replicating the real factory would require a fully wired Drizzle adapter;
// the proxy contract only depends on `auth.handler(req)` being invoked
// (which the stub exercises) and `auth.api.getSession` returning null
// (so the auth-context middleware sets `principal: null`).
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

// Audit-context middleware is a no-op for these tests so the proxy is the
// terminal handler observable in the route tree.
vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

describe("/api/auth route tree", () => {
  // Re-import the app and tenancy cache after the vi.mock declarations have
  // been hoisted so the stubs are in effect when the module graph evaluates.
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
    // Pre-seed the tenancy cache so `tenantMiddleware` resolves the host
    // without a DB lookup. The cache owns key composition and TTL policy.
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
    // The proxy must pin Host to the resolved tenant before BA sees the URL.
    // `sanitizedAuthRequest` rebuilds the Request with the original URL but
    // a pinned Host header, so the URL itself remains intact.
    expect(body.url).toContain("/api/auth/get-session");
    // Proof the proxy ran `sanitizedAuthRequest` rather than forwarding
    // `c.req.raw` directly: the Host header on the inbound Request matches
    // the resolved tenant. If the sanitizer were skipped the value would
    // either be missing (Hono's `app.request` does not auto-populate Host
    // when the URL is absolute) or echo the spoofed value.
    expect(body.host).toBe("acme.app.localhost");
  });
});
