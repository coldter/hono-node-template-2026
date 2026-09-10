import {
  authorization,
  buildAuthorizationPrincipal,
} from "@repo/shared/authorization";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "@/lib/context";
import usersRoutes from "@/modules/users/routes";

const currentUser = buildAuthorizationPrincipal({
  id: "usr_self",
  roleSlugs: ["user"],
  status: "active",
});

const getMyAccountMiddleware =
  (usersRoutes.getMyAccount as unknown as { middleware?: MiddlewareHandler[] })
    .middleware ?? [];

async function requestMyAccount() {
  const app = new Hono<Env>();

  app.use(async (c, next) => {
    c.set("user", {
      id: currentUser.id,
      roleSlugs: ["user"],
      status: "active",
    } as Env["Variables"]["user"]);
    await next();
  });

  for (const middleware of getMyAccountMiddleware) {
    app.use("/me", middleware);
  }

  app.get("/me", (c) => c.json({ ok: true }));

  return app.request("/me");
}

describe("GET /api/users/me authorization", () => {
  it("registers the authorization guard on the route", () => {
    expect(getMyAccountMiddleware.length).toBeGreaterThan(0);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = new Hono<Env>();

    for (const middleware of getMyAccountMiddleware) {
      app.use("/me", middleware);
    }

    app.get("/me", (c) => c.json({ ok: true }));

    const response = await app.request("/me");
    expect(response.status).toBe(401);
  });

  it("allows a normal user to view their own resource", async () => {
    await expect(
      authorization.can(currentUser, "user", "view", {
        resource: { id: currentUser.id },
      })
    ).resolves.toMatchObject({ allowed: true });
  });

  it("denies a normal user from viewing another user's resource", async () => {
    await expect(
      authorization.can(currentUser, "user", "view", {
        resource: { id: "usr_other" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("authorizes the getMyAccount route guard with the current user resource", async () => {
    const response = await requestMyAccount();
    expect(response.status).toBe(200);
  });
});
