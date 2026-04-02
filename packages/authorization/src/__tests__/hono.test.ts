import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthorize, getAuthorizedResource } from "../hono";
import { createAuthSchema, principalAttribute } from "../schema";
import type { Principal } from "../types";

// Set up a test schema and registry
const auth = createAuthSchema({
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
  relations: [],
  principal: { status: principalAttribute<string>() },
  globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
});

interface TestResource {
  createdBy: string;
  id: string;
}

const testResource = auth.createResource<TestResource>("test", {
  actions: ["list", "view", "create", "update", "delete"],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
  ],
  resolveOwner: (r) => r.createdBy,
});

const registry = auth.buildRegistry({ test: testResource });

// Helpers for test principals
const adminPrincipal: Principal = {
  id: "usr_admin",
  roles: ["admin"],
  attributes: { status: "active" },
};
const userPrincipal: Principal = {
  id: "usr_1",
  roles: ["user"],
  attributes: { status: "active" },
};

describe("createAuthorize", () => {
  // Create the authorize function
  // resolvePrincipal reads from a custom header for testing
  const authorize = createAuthorize(registry, {
    resolvePrincipal: (c) => {
      const principalHeader = c.req.header("x-test-principal");
      if (!principalHeader) {
        return null;
      }
      return JSON.parse(principalHeader) as Principal;
    },
  });

  it("authorize(resource, action) allows admin", async () => {
    const app = new Hono();
    app.use("/test", authorize("test", "list"));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { "x-test-principal": JSON.stringify(adminPrincipal) },
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 when no principal", async () => {
    const app = new Hono();
    app.use("/test", authorize("test", "list"));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("returns 403 when unauthorized", async () => {
    const app = new Hono();
    app.use("/test", authorize("test", "create"));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(403);
  });

  it("authorize with loadResource allows owner", async () => {
    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => ({ id: "res_1", createdBy: "usr_1" }),
      })
    );
    app.get("/test/:id", (c) => {
      const resource = getAuthorizedResource<TestResource>(c);
      return c.json({ id: resource.id });
    });

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("res_1");
  });

  it("authorize with loadResource denies non-owner", async () => {
    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => ({ id: "res_1", createdBy: "usr_other" }),
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(403);
  });

  it("authorize.skip always passes", async () => {
    const app = new Hono();
    app.use("/health", authorize.skip("health-check"));
    app.get("/health", (c) => c.json({ ok: true }));

    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("fail-closed: loadResource throws -> 403", async () => {
    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => {
          throw new Error("db error");
        },
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(403);
  });

  it("returns RESOURCE_NOT_FOUND when loadResource returns null", async () => {
    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => null,
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(403);
  });
});
