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

const admin = buildAuthorizationPrincipal({
  id: "usr_admin",
  roleSlugs: ["admin"],
  status: "active",
});

const plainUser = buildAuthorizationPrincipal({
  id: "usr_user",
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

function routeMiddleware(route: RouteConfig): MiddlewareHandler[] {
  if (!route.middleware) {
    return [];
  }
  return Array.isArray(route.middleware)
    ? route.middleware
    : [route.middleware];
}

function createApp(user: Env["Variables"]["user"] | null): Hono<Env> {
  const app = new Hono<Env>();

  if (user) {
    app.use(async (c, next) => {
      c.set("user", user);
      await next();
    });
  }

  for (const middleware of routeMiddleware(usersRoutes.getMyAccount)) {
    app.use("/me", middleware);
  }

  app.get("/me", (c) => c.json({ ok: true }));

  return app;
}

describe("user authorization", () => {
  it("allows admin wildcard actions and scopes plain users to their own record", async () => {
    const adminCapabilities = await authorization.evaluateCapabilities(admin);
    expect(adminCapabilities["user:list"]).toBe(true);
    expect(adminCapabilities["user:assign-roles"]).toBe(true);
    expect(adminCapabilities["role:list"]).toBe(true);
    expect(adminCapabilities["audit-log:list"]).toBe(true);
    expect(adminCapabilities["notification:get-unread-count"]).toBe(true);

    const userCapabilities =
      await authorization.evaluateCapabilities(plainUser);
    expect(userCapabilities["user:list"]).toBe(false);
    expect(userCapabilities["user:assign-roles"]).toBe(false);
    expect(userCapabilities["user:view"]).toBe(true);
    expect(userCapabilities["user:update"]).toBe(true);
    expect(userCapabilities["role:list"]).toBe(true);
    expect(userCapabilities["audit-log:list"]).toBe(false);
    expect(userCapabilities["notification:get-unread-count"]).toBe(true);

    await expect(
      authorization.can(admin, "user", "list")
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      authorization.can(admin, "user", "delete", {
        resource: { id: "usr_user" },
      })
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      authorization.can(plainUser, "user", "list")
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
    await expect(
      authorization.can(plainUser, "user", "create")
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });

    await expect(
      authorization.can(plainUser, "user", "view", {
        resource: { id: "usr_user" },
      })
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      authorization.can(plainUser, "user", "update", {
        resource: { id: "usr_user" },
      })
    ).resolves.toMatchObject({ allowed: true });
    await expect(
      authorization.can(plainUser, "user", "view", {
        resource: { id: "usr_other" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
    await expect(
      authorization.can(plainUser, "user", "update", {
        resource: { id: "usr_other" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "NO_MATCHING_POLICY" });
  });

  it("applies self-target denies, global denies, and fail-closed statuses", async () => {
    await expect(
      authorization.can(admin, "user", "deactivate", {
        resource: { id: "usr_admin" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "EXPLICIT_DENY" });
    await expect(
      authorization.can(admin, "user", "delete", {
        resource: { id: "usr_admin" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "EXPLICIT_DENY" });
    await expect(
      authorization.can(admin, "user", "assign-roles", {
        resource: { id: "usr_admin" },
      })
    ).resolves.toMatchObject({ allowed: false, reason: "EXPLICIT_DENY" });
    await expect(
      authorization.can(admin, "user", "assign-roles", {
        resource: { id: "usr_other" },
      })
    ).resolves.toMatchObject({ allowed: true });

    const inactive = buildAuthorizationPrincipal({
      id: "usr_inactive",
      roleSlugs: ["admin"],
      status: "inactive",
    });
    await expect(
      authorization.can(inactive, "user", "unlock")
    ).resolves.toMatchObject({ allowed: false, reason: "GLOBAL_DENY" });

    const corrupt = buildAuthorizationPrincipal({
      id: "usr_corrupt",
      roleSlugs: ["admin"],
      status: "corrupt",
    });
    expect(corrupt.attributes.status).toBe("deleted");
    await expect(
      authorization.can(corrupt, "user", "list")
    ).resolves.toMatchObject({ allowed: false, reason: "GLOBAL_DENY" });

    const orgMember = buildAuthorizationPrincipal(
      { id: "usr_member", roleSlugs: ["user"], status: "active" },
      { activeOrganizationId: "org_123", activeOrgRole: "member" }
    );
    expect(orgMember.organization).toEqual({ id: "org_123", role: "member" });
  });

  it("guards the getMyAccount route with the caller's own resource", async () => {
    const unauthenticated = await createApp(null).request("/me");
    expect(unauthenticated.status).toBe(401);

    const authorized = await createApp(sessionUser).request("/me");
    expect(authorized.status).toBe(200);
  });
});
