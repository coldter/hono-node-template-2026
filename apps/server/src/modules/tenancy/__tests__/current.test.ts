// Behavioural tests for `/api/tenancy/current`. The handler reads the
// resolved tenant from `c.var.requestContext.tenant` (including its
// `branding` projection); branding is no longer fetched from the DB at
// request time — `resolveTenant` populates the field once and bumps
// flow through the cache invalidator.

import { OpenAPIHono } from "@hono/zod-openapi";
import type { Tenant } from "@repo/tenancy";
import type { Context, Next } from "hono";
import { describe, expect, it } from "vitest";

import { createEmptyRequestContext, type Env } from "@/lib/context";

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    organizationId: "org_test_acme",
    slug: "acme",
    host: "acme.app.example.com",
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
    ...overrides,
  };
}

async function makeApp(tenant: Tenant | null) {
  const { default: currentTenancyRouter } = await import("../current");
  const app = new OpenAPIHono<Env>();
  app.use("*", async (c: Context<Env>, next: Next) => {
    c.set("requestContext", {
      ...createEmptyRequestContext(),
      tenant,
    });
    await next();
  });
  app.route("/api/tenancy/current", currentTenancyRouter);
  return app;
}

describe("/api/tenancy/current", () => {
  it("returns the response shape with a fully-qualified logoUrl when logoVersion > 0", async () => {
    const app = await makeApp(
      makeTenant({
        enforceSSO: true,
        branding: {
          logoVersion: 3,
          primaryColor: "#ff0000",
          appName: "Acme",
        },
      })
    );
    const res = await app.request(
      "http://acme.app.example.com/api/tenancy/current"
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      organizationId: string;
      slug: string | null;
      host: string;
      kind: string;
      enforceSSO: boolean;
      branding: { logoVersion: number; primaryColor: string; appName: string };
      logoUrl: string | null;
    };
    expect(body).toEqual({
      organizationId: "org_test_acme",
      slug: "acme",
      host: "acme.app.example.com",
      kind: "subdomain",
      enforceSSO: true,
      branding: {
        logoVersion: 3,
        primaryColor: "#ff0000",
        appName: "Acme",
      },
      // BRANDING_HOST default is "branding.localhost" per env.ts.
      logoUrl: "https://branding.localhost/org_test_acme/logo.3.webp",
    });
  });

  it("returns logoUrl=null when branding.logoVersion is 0", async () => {
    const app = await makeApp(makeTenant());
    const res = await app.request(
      "http://acme.app.example.com/api/tenancy/current"
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { logoUrl: string | null };
    expect(body.logoUrl).toBeNull();
  });

  it("returns 404 when c.var.tenant is null", async () => {
    const app = await makeApp(null);
    const res = await app.request(
      "http://unknown.app.example.com/api/tenancy/current"
    );
    expect(res.status).toBe(404);
  });
});
