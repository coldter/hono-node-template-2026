/**
 * Ability Definition Factory
 *
 * Creates a CASL ability instance based on a user's permissions.
 * The ability is used to check if a user can perform actions on resources.
 *
 * Note: This is a simplified version. Ownership filtering and complex
 * conditions are handled by the service layer, not CASL rules.
 */

import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";
import { PERMISSIONS } from "../permissions";
import type { Actions, Subjects } from "./subjects";
import type { AbilityContext, AppAbility } from "./types";

// ============================================================
// MAIN FACTORY FUNCTION
// ============================================================

/**
 * Creates a CASL ability instance for the given user context.
 *
 * This is a simplified ability builder that maps permissions to actions.
 * Complex business logic (ownership, assignment) is handled by services.
 *
 * @param ctx - The ability context containing user info and permissions
 * @returns A configured CASL ability instance
 *
 * @example
 * ```typescript
 * const ability = defineAbilityFor({
 *   userId: "user_abc123",
 *   permissions: ["users:view"],
 * });
 *
 * // Check if user can perform action
 * ability.can("read", "User"); // true
 * ability.can("create", "User"); // false
 * ```
 */
export function defineAbilityFor(ctx: AbilityContext): AppAbility {
  const { can, build } = new AbilityBuilder<MongoAbility<[Actions, Subjects]>>(
    createMongoAbility
  );

  // Convert permissions array to Set for O(1) lookups
  const permissionSet = new Set(ctx.permissions);

  /**
   * Helper to check if user has a specific permission.
   * Handles the "*" wildcard for super admins.
   */
  const hasPermission = (perm: { key: string }): boolean => {
    return permissionSet.has("*") || permissionSet.has(perm.key);
  };

  // Wildcard permission grants full access
  if (permissionSet.has("*")) {
    can("manage", "all");
    return build();
  }

  // ══════════════════════════════════════════════════════════════
  // USER RULES
  // ══════════════════════════════════════════════════════════════
  // Self-access is always allowed
  can("read", "User", { id: ctx.userId });
  can("update", "User", { id: ctx.userId });

  if (hasPermission(PERMISSIONS.USERS.VIEW)) {
    can("read", "User");
  }
  if (hasPermission(PERMISSIONS.USERS.CREATE)) {
    can("create", "User");
  }
  if (hasPermission(PERMISSIONS.USERS.UPDATE)) {
    can("update", "User");
  }
  if (hasPermission(PERMISSIONS.USERS.DELETE)) {
    can("delete", "User");
  }
  if (hasPermission(PERMISSIONS.USERS.DEACTIVATE)) {
    can("update", "User");
  }
  if (hasPermission(PERMISSIONS.USERS.ACTIVATE)) {
    can("update", "User");
  }
  if (hasPermission(PERMISSIONS.USERS.UNLOCK)) {
    can("update", "User");
  }

  return build();
}

// ============================================================
// UTILITY EXPORTS
// ============================================================

/**
 * Re-export the subject helper from CASL for convenience.
 * Use this to wrap entities when checking permissions.
 *
 * @example
 * \`\`\`typescript
 * import { subject } from "@repo/shared/abilities";
 *
 * ability.can("read", subject("User", user));
 * \`\`\`
 */
export { subject } from "@casl/ability";
