import type { RouteConfig } from "@hono/zod-openapi";
import { isAuthorizationGuard } from "@repo/authorization/hono";
import { describe, expect, it } from "vitest";
import auditLogsRoutes from "@/modules/audit-logs/routes";
import rolesRoutes from "@/modules/auth/roles/routes";
import notificationsRoutes from "@/modules/notifications/routes";
import usersRoutes from "@/modules/users/routes";

const routeMaps = {
  "audit-logs": auditLogsRoutes,
  notifications: notificationsRoutes,
  roles: rolesRoutes,
  users: usersRoutes,
} satisfies Record<string, Record<string, RouteConfig>>;

function middlewareOf(route: RouteConfig) {
  if (!route.middleware) {
    return [];
  }
  return Array.isArray(route.middleware)
    ? route.middleware
    : [route.middleware];
}

const routes = Object.entries(routeMaps).flatMap(([routeModule, routeMap]) =>
  Object.entries(routeMap).map(([operation, route]) => ({
    middleware: middlewareOf(route),
    operation,
    routeModule,
  }))
);

describe("authorization route coverage", () => {
  it("protects every registered route with an authorization guard", () => {
    const unprotected = routes
      .filter(({ middleware }) => !middleware.some(isAuthorizationGuard))
      .map(({ operation, routeModule }) => `${routeModule}.${operation}`);

    expect(unprotected).toEqual([]);
  });
});
