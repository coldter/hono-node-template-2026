import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, Next } from "hono";
import { describe, expect, it, vi } from "vitest";
import auditLogsRoutes from "@/modules/audit-logs/routes";
import rolesRoutes from "@/modules/auth/roles/routes";
import notificationsRoutes from "@/modules/notifications/routes";
import usersRoutes from "@/modules/users/routes";

vi.mock("@/middlewares/auth-context", () => ({
  authContextMiddleware: async (c: Context, next: Next) => {
    c.set("user", null);
    c.set("session", null);
    await next();
  },
}));

vi.mock("@/modules/auth/handler", () => ({
  default: new OpenAPIHono(),
}));

type RouteWithMiddleware = { middleware?: unknown[] };

function expectRouteHasMiddleware(
  routeGroup: Record<string, RouteWithMiddleware>,
  groupName: string
) {
  for (const [name, route] of Object.entries(routeGroup)) {
    const middleware = route.middleware;
    expect(
      Array.isArray(middleware) && middleware.length > 0,
      `${groupName}.${name} missing authorization guard`
    ).toBe(true);
  }
}

describe("authorization route surfaces", () => {
  it("exposes capabilities endpoint at /api/authorization/capabilities", async () => {
    const { app } = await import("@/routers/main");
    const response = await app.request(
      "http://localhost/api/authorization/capabilities"
    );

    expect(response.status).toBe(401);
  });

  it("exposes roles endpoint at /api/roles", async () => {
    const { app } = await import("@/routers/main");
    const response = await app.request("http://localhost/api/roles");

    expect(response.status).toBe(401);
  });

  it("keeps auth middleware on users routes", () => {
    expectRouteHasMiddleware(
      usersRoutes as Record<string, RouteWithMiddleware>,
      "users"
    );
  });

  it("keeps auth middleware on roles routes", () => {
    expectRouteHasMiddleware(
      rolesRoutes as Record<string, RouteWithMiddleware>,
      "roles"
    );
  });

  it("keeps auth middleware on audit-log routes", () => {
    expectRouteHasMiddleware(
      auditLogsRoutes as Record<string, RouteWithMiddleware>,
      "audit-logs"
    );
  });

  it("keeps auth middleware on notifications routes", () => {
    expectRouteHasMiddleware(
      notificationsRoutes as Record<string, RouteWithMiddleware>,
      "notifications"
    );
  });
});
