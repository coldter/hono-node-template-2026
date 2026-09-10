import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { principalNotActive } from "../conditions";
import {
  AUTHORIZATION_GUARD,
  createAuthorize,
  getAuthorizedResource,
  isAuthorizationGuard,
} from "../hono";
import { createAuthSchema } from "../schema";
import type { Principal } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

const NO_RESOURCE_LOADED = /no resource was loaded/;

const auth = createAuthSchema({
  globalPolicies: (p) => [
    p.deny("*").to("*").whereCondition(principalNotActive()),
  ],
  roles: ["admin", "user"],
  systemAdminRoles: ["admin"],
});

interface TestResource {
  createdBy: string;
  id: string;
}

const testResource = auth.createResource<TestResource>()("test", {
  actions: ["list", "view", "create", "update", "delete", "explode"],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
    p
      .allow("user")
      .to("explode")
      .where(
        () => {
          throw new Error("condition boom");
        },
        { effect: "principal_only" }
      ),
  ],
  resolveOwner: (r) => r.createdBy,
});

const registry = auth.buildRegistry({ test: testResource });

const adminPrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_admin",
  roles: ["admin"],
};
const userPrincipal: Principal = {
  attributes: { status: "active" },
  id: "usr_1",
  roles: ["user"],
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
        loadResource: async () => ({ createdBy: "usr_1", id: "res_1" }),
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
        loadResource: async () => ({ createdBy: "usr_other", id: "res_1" }),
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(403);
  });

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

  it("returns UNAUTHORIZED when the resource is missing and no principal is present", async () => {
    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => null,
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });
  });

  it("returns INTERNAL_ERROR when the missing-resource lookup evaluates with an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "explode", {
        loadResource: async () => null,
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error" },
    });

    const payloads = spy.mock.calls.map(
      (call) =>
        JSON.parse(String(call[0])) as {
          cause?: { message?: string };
          event?: string;
        }
    );
    const evaluationLog = payloads.find(
      (payload) => payload.event === "authorization.evaluation_error"
    );
    expect(evaluationLog?.cause?.message).toBe("condition boom");
  });

  it("returns NOT_FOUND when an allowed action targets a missing resource", async () => {
    const app = new Hono();
    app.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => null,
      })
    );
    app.get("/test/:id", (c) => c.json({ ok: true }));

    const res = await app.request("/test/res_1", {
      headers: { "x-test-principal": JSON.stringify(adminPrincipal) },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: "Not Found" },
    });
  });

  it("maps EVALUATION_ERROR to 500 INTERNAL_ERROR and logs the cause", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const app = new Hono();
    app.use("/test", authorize("test", "explode"));
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: { "x-test-principal": JSON.stringify(userPrincipal) },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error" },
    });

    const payloads = spy.mock.calls.map(
      (call) =>
        JSON.parse(String(call[0])) as {
          cause?: { message?: string };
          event?: string;
          path?: string;
        }
    );
    const evaluationLog = payloads.find(
      (payload) => payload.event === "authorization.evaluation_error"
    );
    expect(evaluationLog?.path).toBe("/test");
    expect(evaluationLog?.cause?.message).toBe("condition boom");
  });
});

describe("isAuthorizationGuard", () => {
  const authorize = createAuthorize(registry, {
    resolvePrincipal: () => null,
  });

  it("returns true for every middleware created by createAuthorize", () => {
    expect(isAuthorizationGuard(authorize("test", "list"))).toBe(true);
    expect(
      isAuthorizationGuard(
        authorize("test", "view", {
          loadResource: async () => ({ createdBy: "u1", id: "u1" }),
        })
      )
    ).toBe(true);
  });

  it("returns false for plain functions", () => {
    expect(isAuthorizationGuard(async () => undefined)).toBe(false);
    expect(isAuthorizationGuard(() => undefined)).toBe(false);
  });

  it("detects functions marked with AUTHORIZATION_GUARD", () => {
    const marked = Object.assign(async () => undefined, {
      [AUTHORIZATION_GUARD]: true,
    });
    expect(isAuthorizationGuard(marked)).toBe(true);
  });

  it("returns false for values that are not functions", () => {
    expect(isAuthorizationGuard({ [AUTHORIZATION_GUARD]: true })).toBe(false);
    expect(isAuthorizationGuard(null)).toBe(false);
    expect(isAuthorizationGuard(undefined)).toBe(false);
  });
});
