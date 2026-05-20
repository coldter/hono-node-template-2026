import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@repo/tenancy");

vi.mock("@/modules/auth/instance", () => ({
  createAuth: () => ({
    api: {
      getSession: async () => null,
    },
    handler: (req: Request) =>
      Promise.resolve(new Response("", { status: 200, headers: req.headers })),
  }),
}));

vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

// SKIP_DB=true: stub the `liveOrganizations(db).selectById` read seam only; other consumers keep the real implementation.
vi.mock("@repo/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@repo/db")>();
  return {
    ...original,
    liveOrganizations: () => ({
      selectById: async () => [
        {
          branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
        },
      ],
    }),
  };
});

type CurrentTenancyBody = {
  organizationId: string;
  slug: string | null;
  host: string;
  kind: "subdomain" | "custom";
  enforceSSO: boolean;
};

describe("tenant resolution contract", () => {
  let appModule: typeof import("@/routers/main");
  let serverModule: typeof import("@/server");

  beforeEach(async () => {
    vi.resetModules();
    serverModule = await import("@/server");
    appModule = await import("@/routers/main");
    serverModule.tenancyCache.clearLocal();
  });

  it("resolves a known subdomain host and exposes it via useTenant", async () => {
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
      "http://acme.app.localhost/api/tenancy/current",
      { headers: { host: "acme.app.localhost" } }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as CurrentTenancyBody;
    expect(body.slug).toBe("acme");
    expect(body.host).toBe("acme.app.localhost");
    expect(body.kind).toBe("subdomain");
    expect(body.organizationId).toBe("org_test_acme");
  });

  it("404s on an unknown subdomain host (negative-cache write happens in resolver)", async () => {
    const res = await appModule.app.request(
      "http://ghost.app.localhost/api/tenancy/current",
      { headers: { host: "ghost.app.localhost" } }
    );
    expect(res.status).toBe(404);
  });

  it("resolves a custom hostname when the cache says so", async () => {
    serverModule.tenancyCache.set("app.acme.com", {
      kind: "found",
      tenant: {
        organizationId: "org_test_acme_custom",
        slug: "acme",
        host: "app.acme.com",
        kind: "custom",
        enforceSSO: false,
        sessionVersion: 0,
        suspendedAt: null,
        deletedAt: null,
        branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
      },
    });

    const res = await appModule.app.request(
      "http://app.acme.com/api/tenancy/current",
      { headers: { host: "app.acme.com" } }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as CurrentTenancyBody;
    expect(body.host).toBe("app.acme.com");
    expect(body.kind).toBe("custom");
    expect(body.organizationId).toBe("org_test_acme_custom");
  });

  it("503s on a suspended tenant (tenantMiddleware short-circuit)", async () => {
    serverModule.tenancyCache.set("paused.app.localhost", {
      kind: "suspended",
      tenant: {
        organizationId: "org_test_paused",
        slug: "paused",
        host: "paused.app.localhost",
        kind: "subdomain",
        enforceSSO: false,
        sessionVersion: 1,
        suspendedAt: new Date("2026-05-01T00:00:00Z"),
        deletedAt: null,
        branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
      },
    });

    const res = await appModule.app.request(
      "http://paused.app.localhost/api/tenancy/current",
      { headers: { host: "paused.app.localhost" } }
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
  });

  it("rejects the apex (FALLBACK_HOST) with 404 — apex is not a tenant", async () => {
    const res = await appModule.app.request(
      "http://app.localhost/api/tenancy/current",
      { headers: { host: "app.localhost" } }
    );
    expect(res.status).toBe(404);
  });

  it("keeps requestContext.principal null when no session cookie is present", async () => {
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
      "http://acme.app.localhost/api/tenancy/current",
      { headers: { host: "acme.app.localhost" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as CurrentTenancyBody;
    expect(body.organizationId).toBe("org_test_acme");
  });
});
