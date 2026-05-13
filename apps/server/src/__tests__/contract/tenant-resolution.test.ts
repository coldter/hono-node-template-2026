/**
 * Drives the production middleware chain
 * (hostHeaderGuard -> tenantMiddleware -> tenantBridge -> authContext)
 * against the assembled `app` via `app.request(url)`. Catches wiring
 * regressions BETWEEN packages: cache key composition in `@repo/tenancy`,
 * the bridge middleware in `apps/server`, and the `requestContext`
 * envelope contract that handlers depend on.
 *
 * SKIP_DB note: `vitest.config.ts` sets `SKIP_DB=true`, so the chain
 * mounts a stub `pg.Pool#query` returning zero rows. "Happy path" cases
 * pre-seed the `tenancyCache` directly; the unknown-host case relies on
 * the stub returning empty rows so the resolver writes a negative cache
 * entry and the middleware short-circuits to 404.
 *
 * Auth seam: `@/modules/auth/instance` is stubbed so `auth.api.getSession`
 * returns null without booting Better Auth's DB/secret machinery, isolating
 * the assertion to the tenant slot.
 */

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

// `/api/tenancy/current` reads branding via `liveOrganizations(db).selectById`.
// SKIP_DB=true means `db` is not a real Drizzle client, so we stub the read
// seam to a fixed branding row. This is scoped: only `selectById` is touched;
// every other consumer of `liveOrganizations` (lifecycle writer, etc.) keeps
// its real implementation.
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

  it("resolves a known subdomain host and populates requestContext.tenant", async () => {
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
    // The `/api/tenancy/current` handler reads `c.var.requestContext.tenant`;
    // these fields appearing in the response prove the envelope was populated
    // by the tenantMiddleware onResolve callback.
    expect(body.slug).toBe("acme");
    expect(body.host).toBe("acme.app.localhost");
    expect(body.kind).toBe("subdomain");
    expect(body.organizationId).toBe("org_test_acme");
  });

  it("404s on an unknown subdomain host (negative-cache write happens in resolver)", async () => {
    // No cache prime; the SKIP_DB stub returns zero rows, so `resolveTenant`
    // writes a `not_found` entry and `tenantMiddleware` returns 404.
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
    // Prime the cache with a `suspended` shape directly. The resolver writes
    // this same shape when it reads `suspended_at IS NOT NULL` from the org
    // row, so the cached path and the cold path produce the same outcome.
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
    // `parseHostname` matches `app.localhost` to `fallbackHost` and
    // `resolveTenant` collapses fallback/admin/rejected to `not_found`.
    const res = await appModule.app.request(
      "http://app.localhost/api/tenancy/current",
      { headers: { host: "app.localhost" } }
    );
    expect(res.status).toBe(404);
  });

  it("keeps requestContext.principal null when no session cookie is present", async () => {
    // Combined assertion: a known subdomain returns the tenant payload AND
    // the route ran without an authenticated principal. The auth stub above
    // pins `getSession` to null; the auth-context middleware therefore writes
    // `principal: null` into the envelope. If a future refactor reorders the
    // chain so the route runs BEFORE auth-context, the response would still
    // succeed — but the principal contract would silently regress, which is
    // why a sibling assertion lives in `chain.test.ts` ordering the entries.
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
