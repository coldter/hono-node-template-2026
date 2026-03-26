import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import {
  hasRole as checkRole,
  type RoleSlug,
  SYSTEM_ROLES,
  type SystemRoleSlug,
} from "@/modules/auth/roles";

/**
 * Role guard middleware factory
 *
 * Checks if the authenticated user has the specified role.
 * Returns 401 if not authenticated, 403 if role not assigned.
 *
 * Overloaded for type safety - system roles get autocomplete.
 *
 * @param role - Role slug to check
 *
 * @example
 * ```typescript
 * // Type-safe role check with autocomplete for system roles
 * app.get("/admin/dashboard", isAuthenticated, requireRole("admin"), handler);
 *
 * // Dynamic role check
 * app.get("/custom", isAuthenticated, requireRole("custom-role"), handler);
 * ```
 */
export function requireRole(
  role: SystemRoleSlug | RoleSlug | string
): ReturnType<typeof createMiddleware<Env>> {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401
      );
    }

    if (
      !checkRole(
        { roleSlugs: (user as { roleSlugs?: string[] }).roleSlugs ?? [] },
        role
      )
    ) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            details: `Missing required role: ${role}`,
          },
        },
        403
      );
    }

    return next();
  });
}

/**
 * Convenience middleware - requires admin role
 *
 * @example
 * ```typescript
 * app.get("/admin/settings", isAuthenticated, requireAdmin, handler);
 * ```
 */
export const requireAdmin = requireRole(SYSTEM_ROLES.ADMIN.slug);

/**
 * Convenience middleware - requires user role
 *
 * @example
 * ```typescript
 * app.get("/user/dashboard", isAuthenticated, requireUser, handler);
 * ```
 */
export const requireUser = requireRole(SYSTEM_ROLES.USER.slug);

/**
 * Multiple role guard middleware
 *
 * Checks if the authenticated user has ANY of the specified roles.
 * Returns 401 if not authenticated, 403 if no matching role.
 *
 * @param roles - Role slugs to check (user needs at least one)
 *
 * @example
 * ```typescript
 * app.get(
 *   "/reports",
 *   isAuthenticated,
 *   requireAnyRole("admin", "user"),
 *   handler
 * );
 * ```
 */
export function requireAnyRole(...roles: RoleSlug[]) {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401
      );
    }

    const userRoles = (user as { roleSlugs?: string[] }).roleSlugs ?? [];
    const hasAny = roles.some((role) => userRoles.includes(role));

    if (!hasAny) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            details: `Missing required role. Need one of: ${roles.join(", ")}`,
          },
        },
        403
      );
    }

    return next();
  });
}

/**
 * Multiple role guard middleware (all required)
 *
 * Checks if the authenticated user has ALL of the specified roles.
 * Returns 401 if not authenticated, 403 if missing any role.
 *
 * @param roles - Role slugs to check (user needs all of them)
 *
 * @example
 * ```typescript
 * app.get(
 *   "/super-admin",
 *   isAuthenticated,
 *   requireAllRoles("admin", "super"),
 *   handler
 * );
 * ```
 */
export function requireAllRoles(...roles: RoleSlug[]) {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401
      );
    }

    const userRoles = (user as { roleSlugs?: string[] }).roleSlugs ?? [];
    const missingRoles = roles.filter((role) => !userRoles.includes(role));

    if (missingRoles.length > 0) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            details: `Missing required roles: ${missingRoles.join(", ")}`,
          },
        },
        403
      );
    }

    return next();
  });
}
