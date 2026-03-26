/**
 * Ability Middleware
 *
 * Injects a CASL ability instance into the request context for the authenticated user.
 * The ability encodes authorization rules based on the user's permissions.
 *
 * This middleware should run AFTER the auth context middleware.
 *
 * @example
 * ```typescript
 * // In route handler:
 * const ability = c.get("ability");
 * if (ability?.can("read", "User")) {
 *   // User has users:view permission
 * }
 * ```
 */

import { defineAbilityFor } from "@repo/shared/abilities";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";

/**
 * Middleware that creates and injects a CASL ability instance.
 *
 * The ability is built from:
 * 1. User's permissions (derived from their roles)
 * 2. User's ID (for self-access checks)
 *
 * If user is not authenticated, ability is set to null.
 */
export const abilityMiddleware = createMiddleware<Env>(async (c, next) => {
  const user = c.get("user");

  // No user = no ability (will be handled by auth guards)
  if (!user) {
    c.set("ability", null);
    return next();
  }

  // Build the ability from user context
  const ability = defineAbilityFor({
    userId: user.id,
    permissions: user.permissions ?? [],
  });

  c.set("ability", ability);
  return next();
});

export default abilityMiddleware;
