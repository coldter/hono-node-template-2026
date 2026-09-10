import type { RouteConfig } from "@hono/zod-openapi";
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

const sessionUser: Env["Variables"]["user"] = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  deactivatedAt: null,
  deactivatedBy: null,
  deactivatedReason: null,
  email: "self@example.com",
  emailVerified: true,
  failedLoginAttempts: 0,
  id: "usr_self",
  image: null,
  lockedUntil: null,
  name: "Self",
  onboardingCompletedAt: null,
  roleSlugs: ["user"],
  status: "active",
  twoFactorEnabled: false,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const getMyAccountRoute: RouteConfig = usersRoutes.getMyAccount;

function routeMiddleware(route: RouteConfig): MiddlewareHandler[] {
  if (!route.middleware) {
    return [];
  }
  return Array.isArray(route.middleware)
    ? route.middleware
    : [route.middleware];
}

const getMyAccountMiddleware = routeMiddleware(getMyAccountRoute);

function createApp(user: Env["Variables"]["user"]): Hono<Env> {
  const app = new Hono<Env>();

  if (user) {
    app.use(async (c, next) => {
      c.set("user", user);
      await next();
    });
  }

  for (const middleware of getMyAccountMiddleware) {
    app.use("/me", middleware);
  }

  app.get("/me", (c) => c.json({ ok: true }));

  return app;
}

describe("GET /api/users/me authorization", () => {
  it("returns 401 when unauthenticated", async () => {
    const response = await createApp(null).request("/me");
    expect(response.status).toBe(401);
  });

  it("denies a normal user from viewing another user's resource", async () => {
    await expect(
      authorization.can(currentUser, "user", "view", {
        resource: { id: "usr_other" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("authorizes the getMyAccount route guard with the current user resource", async () => {
    const response = await createApp(sessionUser).request("/me");
    expect(response.status).toBe(200);
  });
});
