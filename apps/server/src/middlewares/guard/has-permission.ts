import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import {
  hasAnyPermission as checkAnyPermission,
  hasPermission as checkPermission,
  getPermissionKey,
  type PermissionIdentifier,
} from "@/modules/auth/roles";

/**
 * Permission guard middleware
 *
 * Checks if the authenticated user has the specified permission.
 * Returns 401 if not authenticated, 403 if permission denied.
 *
 * Accepts either a permission key string or a permission object:
 *   - requirePermission(PERMISSIONS.USERS.VIEW) // object with autocomplete
 *   - requirePermission("users:view") // string key
 *
 * @param permission - Permission identifier (key or object)
 *
 * @example
 * ```typescript
 * // Using permission object (recommended - has autocomplete)
 * app.get(
 *   "/users",
 *   isAuthenticated,
 *   requirePermission(PERMISSIONS.USERS.VIEW),
 *   handler
 * );
 *
 * // Using permission key string
 * app.get(
 *   "/users",
 *   isAuthenticated,
 *   requirePermission("users:view"),
 *   handler
 * );
 * ```
 */
export const requirePermission = (permission: PermissionIdentifier) =>
  createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");
    const permissionKey = getPermissionKey(permission);

    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401
      );
    }

    const granted = await checkPermission(
      { roleSlugs: (user as { roleSlugs?: string[] }).roleSlugs ?? [] },
      permission
    );

    if (!granted) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            details: `Missing required permission: ${permissionKey}`,
          },
        },
        403
      );
    }

    return next();
  });

/**
 * Multiple permission guard middleware (any required)
 *
 * Checks if the authenticated user has ANY of the specified permissions.
 * Returns 401 if not authenticated, 403 if no matching permission.
 *
 * @param permissions - Permission identifiers to check (user needs at least one)
 *
 * @example
 * ```typescript
 * app.get(
 *   "/content",
 *   requireAnyPermission(
 *     PERMISSIONS.USERS.VIEW,
 *     PERMISSIONS.ROLES.VIEW
 *   ),
 *   handler
 * );
 * ```
 */
export function requireAnyPermission(...permissions: PermissionIdentifier[]) {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401
      );
    }

    const granted = await checkAnyPermission(
      { roleSlugs: (user as { roleSlugs?: string[] }).roleSlugs ?? [] },
      permissions
    );

    if (!granted) {
      const permissionKeys = permissions.map(getPermissionKey);
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            details: `Missing required permission. Need one of: ${permissionKeys.join(", ")}`,
          },
        },
        403
      );
    }

    return next();
  });
}

/**
 * Multiple permission guard middleware (all required)
 *
 * Checks if the authenticated user has ALL of the specified permissions.
 * Returns 401 if not authenticated, 403 if missing any permission.
 *
 * @param permissions - Permission identifiers to check (user needs all of them)
 *
 * @example
 * ```typescript
 * app.get(
 *   "/admin/users",
 *   requireAllPermissions(
 *     PERMISSIONS.USERS.VIEW,
 *     PERMISSIONS.USERS.UPDATE
 *   ),
 *   handler
 * );
 * ```
 */
export function requireAllPermissions(...permissions: PermissionIdentifier[]) {
  return createMiddleware<Env>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
        401
      );
    }

    const userWithRoles = {
      roleSlugs: (user as { roleSlugs?: string[] }).roleSlugs ?? [],
    };

    const missingPermissions: string[] = [];
    for (const permission of permissions) {
      const granted = await checkPermission(userWithRoles, permission);
      if (!granted) {
        missingPermissions.push(getPermissionKey(permission));
      }
    }

    if (missingPermissions.length > 0) {
      return c.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden",
            details: `Missing required permissions: ${missingPermissions.join(", ")}`,
          },
        },
        403
      );
    }

    return next();
  });
}
