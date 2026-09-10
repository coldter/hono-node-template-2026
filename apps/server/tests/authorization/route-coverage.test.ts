import { isAuthorizationGuard } from "@repo/authorization/hono";
import type { MiddlewareHandler } from "hono";
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
};

function middlewareOf(route: unknown): MiddlewareHandler[] {
  const { middleware } = route as { middleware?: unknown };
  return Array.isArray(middleware) ? middleware : [];
}

const routes = Object.entries(routeMaps).flatMap(([routeModule, routeMap]) =>
  Object.entries(routeMap).map(([operation, route]) => ({
    middleware: middlewareOf(route),
    operation,
    routeModule,
  }))
);

describe("authorization route coverage", () => {
  it.each(routes)(
    "$routeModule.$operation is protected by an authorization guard",
    ({ middleware }) => {
      expect(middleware.some(isAuthorizationGuard)).toBe(true);
    }
  );
});
