/**
 * Integration test for the dev-only `X-Dev-Tenant-Slug` header. The chain
 * entry is only constructed when `ALLOW_DEV_TENANT_HEADER === "1"` AND
 * `NODE_ENV !== "production"` — defense in depth against a mis-set env.
 * On a matching dev request, the inbound Host is rewritten to
 * `${slug}.${apex}` so `tenantMiddleware` resolves the impersonated tenant.
 */

import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@repo/tenancy");

vi.mock("@/modules/auth/instance", () => ({
  createAuth: () => ({
    api: { getSession: async () => null },
    handler: (req: Request) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            host: req.headers.get("host"),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      ),
  }),
}));

vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

describe("X-Dev-Tenant-Slug header", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rewrites Host to slug.apex when ALLOW_DEV_TENANT_HEADER=1", async () => {
    vi.stubEnv("ALLOW_DEV_TENANT_HEADER", "1");
    vi.stubEnv("NODE_ENV", "development");

    const serverModule = await import("@/server");
    const appModule = await import("@/routers/main");

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
      "http://localhost:3000/api/auth/get-session",
      {
        headers: {
          host: "localhost:3000",
          "x-dev-tenant-slug": "acme",
        },
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; host: string | null };
    expect(body.ok).toBe(true);
    expect(body.host).toBe("acme.app.localhost");

    vi.unstubAllEnvs();
  });

  it("ignores the header when ALLOW_DEV_TENANT_HEADER=0", async () => {
    vi.stubEnv("ALLOW_DEV_TENANT_HEADER", "0");
    vi.stubEnv("NODE_ENV", "development");

    const appModule = await import("@/routers/main");

    const res = await appModule.app.request(
      "http://ghost.app.localhost/api/auth/get-session",
      {
        headers: {
          host: "ghost.app.localhost",
          "x-dev-tenant-slug": "acme",
        },
      }
    );
    // No rewrite — `ghost.app.localhost` is unknown, so tenantMiddleware 404s.
    expect(res.status).toBe(404);

    vi.unstubAllEnvs();
  });

  it("does not register the chain entry when ALLOW_DEV_TENANT_HEADER is unset", async () => {
    vi.stubEnv("ALLOW_DEV_TENANT_HEADER", "0");
    vi.stubEnv("NODE_ENV", "development");

    const chainModule = await import("@/chain");
    const names = chainModule.chain.map((e) => e.name);
    expect(names).not.toContain("devTenantHeader");

    vi.unstubAllEnvs();
  });

  it("does not register the chain entry under NODE_ENV=production even if flag is set", async () => {
    vi.stubEnv("ALLOW_DEV_TENANT_HEADER", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");

    const chainModule = await import("@/chain");
    const names = chainModule.chain.map((e) => e.name);
    expect(names).not.toContain("devTenantHeader");

    vi.unstubAllEnvs();
  });
});
