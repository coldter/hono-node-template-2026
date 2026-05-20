import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { Tenant } from "../types";
import { useTenant, useTenantMaybe } from "../use-tenant";

function fixtureTenant(): Tenant {
  return {
    organizationId: "org_acme",
    slug: "acme",
    host: "acme.app.example.com",
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
  };
}

describe("useTenant", () => {
  it("returns the tenant when c.var.tenant was set upstream", async () => {
    const tenant = fixtureTenant();
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("tenant", tenant);
      await next();
    });
    app.get("/x", (c) => {
      const t = useTenant(c);
      return c.json({ organizationId: t.organizationId });
    });

    const res = await app.request("/x");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ organizationId: "org_acme" });
  });

  it("throws the invariant error when tenantMiddleware never ran", async () => {
    const app = new Hono();
    app.get("/x", (c) => {
      const t = useTenant(c);
      return c.json({ organizationId: t.organizationId });
    });
    // hono swallows handler throws into a 500; onError surfaces the message verbatim so invariant is observable
    let capturedMessage: string | null = null;
    app.onError((err, c) => {
      capturedMessage = err.message;
      return c.text("err", 500);
    });

    const res = await app.request("/x");
    expect(res.status).toBe(500);
    expect(capturedMessage).toBe(
      "useTenant called without tenantMiddleware in the chain; mount tenantMiddleware on this route or use useTenantMaybe"
    );
  });
});

describe("useTenantMaybe", () => {
  it("returns the tenant when c.var.tenant was set upstream", async () => {
    const tenant = fixtureTenant();
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("tenant", tenant);
      await next();
    });
    app.get("/x", (c) => {
      const t = useTenantMaybe(c);
      return c.json({ hasTenant: t !== null });
    });

    const res = await app.request("/x");
    expect(await res.json()).toEqual({ hasTenant: true });
  });

  it("returns null when tenantMiddleware never ran", async () => {
    const app = new Hono();
    app.get("/x", (c) => {
      const t = useTenantMaybe(c);
      return c.json({ hasTenant: t !== null });
    });

    const res = await app.request("/x");
    expect(await res.json()).toEqual({ hasTenant: false });
  });
});
