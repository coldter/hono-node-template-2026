import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthorize, getAuthorizedResource } from "../hono";
import { createAuthSchema, principalAttribute } from "../schema";
import type { Principal } from "../types";

const NO_RESOURCE_LOADED = /no resource was loaded/;
const NOT_IN_ALLOWED_BYPASS = /not in allowedBypassLabels/;

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
  const authorize = createAuthorize(registry, {
    resolvePrincipal: (c) => {
      const principalHeader = c.req.header("x-test-principal");
      if (!principalHeader) {
        return null;
      }
      return JSON.parse(principalHeader) as Principal;
    },
    allowedBypassLabels: ["health-check"],
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

  it("getAuthorizedResource throws when no resource was loaded", async () => {
    const app = new Hono();
    app.onError((err, c) =>
      c.json(
        { error: { code: "INTERNAL_ERROR", message: err.message } },
        { status: 500 }
      )
    );
    app.use("/test", authorize("test", "list"));
    app.get("/test", (c) => {
      const resource = getAuthorizedResource<TestResource>(c);
      return c.json({ id: resource.id });
    });

    const res = await app.request("/test", {
      headers: { "x-test-principal": JSON.stringify(adminPrincipal) },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toMatch(NO_RESOURCE_LOADED);
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

  it("unsafeBypassAuthorization passes for whitelisted label and warns", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      const app = new Hono();
      app.use("/health", authorize.unsafeBypassAuthorization("health-check"));
      app.get("/health", (c) => c.json({ ok: true }));

      const res = await app.request("/health");
      expect(res.status).toBe(200);

      expect(warnings).toHaveLength(1);
      const parsed = JSON.parse(warnings[0] ?? "{}") as Record<string, unknown>;
      expect(parsed.event).toBe("authorization.bypass");
      expect(parsed.label).toBe("health-check");
      expect(parsed.path).toBe("/health");
      expect(parsed.method).toBe("GET");
    } finally {
      console.warn = originalWarn;
    }
  });

  it("unsafeBypassAuthorization throws at construction for unregistered label", () => {
    expect(() => {
      authorize.unsafeBypassAuthorization("unknown-label");
    }).toThrow(NOT_IN_ALLOWED_BYPASS);
  });

  it("createAuthorize without allowedBypassLabels rejects every bypass call", () => {
    const strictAuthorize = createAuthorize(registry, {
      resolvePrincipal: () => null,
    });
    expect(() => {
      strictAuthorize.unsafeBypassAuthorization("anything");
    }).toThrow(NOT_IN_ALLOWED_BYPASS);
  });

  // Operational/programmer errors thrown from loadResource must NOT be
  // flattened to 403 by the middleware. They should propagate to Hono's
  // global onError handler so logs/metrics can distinguish ops failures
  // from policy denials. The default Hono behaviour without onError is a
  // 500 response.
  it("propagates loadResource errors to Hono onError (does not 403)", async () => {
    const app = new Hono();
    app.onError((err, c) =>
      c.json(
        { error: { code: "INTERNAL_ERROR", message: err.message } },
        { status: 500 }
      )
    );
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
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("db error");
  });

  // The wire body is intentionally indistinguishable between "resource not
  // found" and "policy denied" -- both surface as FORBIDDEN to avoid a
  // resource-existence side channel. Server logs use decision.reason for
  // operational distinction.
  it("returns FORBIDDEN with uniform body when loadResource returns null", async () => {
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
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  });
});
