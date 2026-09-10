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

const NO_RESOURCE_LOADED_PATTERN = /no resource was loaded/;

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

const authorize = createAuthorize(registry, {
  resolvePrincipal: (c) => {
    const principalHeader = c.req.header("x-test-principal");
    if (!principalHeader) {
      return null;
    }
    return JSON.parse(principalHeader);
  },
});

function principalHeaders(principal: Principal) {
  return { "x-test-principal": JSON.stringify(principal) };
}

describe("createAuthorize", () => {
  it("allows authorized requests and exposes the loaded resource", async () => {
    const adminApp = new Hono();
    adminApp.use("/test", authorize("test", "list"));
    adminApp.get("/test", (c) => c.json({ ok: true }));

    const adminResponse = await adminApp.request("/test", {
      headers: principalHeaders(adminPrincipal),
    });
    expect(adminResponse.status).toBe(200);

    const ownerApp = new Hono();
    ownerApp.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => ({ createdBy: "usr_1", id: "res_1" }),
      })
    );
    ownerApp.get("/test/:id", (c) =>
      c.json({ id: getAuthorizedResource<TestResource>(c).id })
    );

    const ownerResponse = await ownerApp.request("/test/res_1", {
      headers: principalHeaders(userPrincipal),
    });
    expect(ownerResponse.status).toBe(200);
    expect(await ownerResponse.json()).toEqual({ id: "res_1" });
  });

  it("maps unauthenticated and forbidden outcomes to uniform bodies", async () => {
    const unauthorizedApp = new Hono();
    unauthorizedApp.use("/test", authorize("test", "list"));
    unauthorizedApp.get("/test", (c) => c.json({ ok: true }));

    const unauthorized = await unauthorizedApp.request("/test");
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Unauthorized" },
    });

    const forbiddenApp = new Hono();
    forbiddenApp.use("/test", authorize("test", "create"));
    forbiddenApp.get("/test", (c) => c.json({ ok: true }));

    const forbidden = await forbiddenApp.request("/test", {
      headers: principalHeaders(userPrincipal),
    });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });

    const missingResourceApp = new Hono();
    missingResourceApp.use(
      "/test/:id",
      authorize("test", "view", { loadResource: async () => null })
    );
    missingResourceApp.get("/test/:id", (c) => c.json({ ok: true }));

    const missingResource = await missingResourceApp.request("/test/res_1", {
      headers: principalHeaders(userPrincipal),
    });
    expect(missingResource.status).toBe(403);
    expect(await missingResource.json()).toEqual({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  });

  it("maps missing resources to 404 and evaluation errors to 500 with a logged cause", async () => {
    const notFoundApp = new Hono();
    notFoundApp.use(
      "/test/:id",
      authorize("test", "view", { loadResource: async () => null })
    );
    notFoundApp.get("/test/:id", (c) => c.json({ ok: true }));

    const notFound = await notFoundApp.request("/test/res_1", {
      headers: principalHeaders(adminPrincipal),
    });
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Not Found" },
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const errorApp = new Hono();
    errorApp.use("/test", authorize("test", "explode"));
    errorApp.get("/test", (c) => c.json({ ok: true }));

    const evaluationError = await errorApp.request("/test", {
      headers: principalHeaders(userPrincipal),
    });
    expect(evaluationError.status).toBe(500);
    expect(await evaluationError.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal Server Error" },
    });

    const payloads = spy.mock.calls.map((call) => JSON.parse(String(call[0])));
    const evaluationLog = payloads.find(
      (payload) => payload.event === "authorization.evaluation_error"
    );
    expect(evaluationLog?.path).toBe("/test");
    expect(evaluationLog?.cause?.message).toBe("condition boom");
  });

  it("propagates loader failures and rejects unloaded resources", async () => {
    const loaderErrorApp = new Hono();
    loaderErrorApp.onError((err, c) =>
      c.json(
        { error: { code: "INTERNAL_ERROR", message: err.message } },
        { status: 500 }
      )
    );
    loaderErrorApp.use(
      "/test/:id",
      authorize("test", "view", {
        loadResource: async () => {
          throw new Error("db error");
        },
      })
    );
    loaderErrorApp.get("/test/:id", (c) => c.json({ ok: true }));

    const loaderFailure = await loaderErrorApp.request("/test/res_1", {
      headers: principalHeaders(userPrincipal),
    });
    expect(loaderFailure.status).toBe(500);
    expect(await loaderFailure.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "db error" },
    });

    const noResourceApp = new Hono();
    noResourceApp.onError((err, c) =>
      c.json(
        { error: { code: "INTERNAL_ERROR", message: err.message } },
        { status: 500 }
      )
    );
    noResourceApp.use("/test", authorize("test", "list"));
    noResourceApp.get("/test", (c) =>
      c.json({ id: getAuthorizedResource<TestResource>(c).id })
    );

    const noResource = await noResourceApp.request("/test", {
      headers: principalHeaders(adminPrincipal),
    });
    expect(noResource.status).toBe(500);
    const body = await noResource.json();
    expect(body.error.message).toMatch(NO_RESOURCE_LOADED_PATTERN);
  });
});

describe("isAuthorizationGuard", () => {
  it("detects guards by symbol and rejects plain middleware", () => {
    const guardAuthorize = createAuthorize(registry, {
      resolvePrincipal: () => null,
    });

    expect(isAuthorizationGuard(guardAuthorize("test", "list"))).toBe(true);
    expect(
      isAuthorizationGuard(
        guardAuthorize("test", "view", {
          loadResource: async () => ({ createdBy: "u1", id: "u1" }),
        })
      )
    ).toBe(true);

    const marked = Object.assign(async () => undefined, {
      [AUTHORIZATION_GUARD]: true,
    });
    expect(isAuthorizationGuard(marked)).toBe(true);

    expect(isAuthorizationGuard(async () => undefined)).toBe(false);
    expect(isAuthorizationGuard(() => undefined)).toBe(false);
  });
});
