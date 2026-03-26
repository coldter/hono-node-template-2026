/**
 * Core Types for the Ability System
 *
 * This module defines:
 * - AppAbility: The main CASL ability type configured for our app
 * - AbilityContext: The context needed to build an ability instance
 */

import type { MongoAbility, RawRuleOf } from "@casl/ability";
import type { Actions, Subjects } from "./subjects";

// ============================================================
// ABILITY TYPE
// ============================================================

/**
 * The main ability type for our application.
 *
 * Usage:
 * ```typescript
 * const ability: AppAbility = defineAbilityFor(context);
 * ability.can("read", "User"); // type-level check
 * ability.can("read", subject("User", userInstance)); // instance check
 * ```
 */
export type AppAbility = MongoAbility<[Actions, Subjects]>;

/**
 * Raw rule type for our ability.
 * Useful when you need to work with rules directly.
 */
export type AppAbilityRule = RawRuleOf<AppAbility>;

// ============================================================
// ABILITY CONTEXT
// ============================================================

/**
 * Context required to build an ability instance.
 *
 * This context is typically derived from:
 * - Server: Authenticated user from request context
 * - Frontend: Current user from auth state
 *
 * @property userId - The ID of the current user
 * @property permissions - Array of permission keys the user has
 */
export interface AbilityContext {
  /**
   * Permission keys granted to the user.
   * Typically derived from the user's roles.
   *
   * Special value "*" grants all permissions (super admin).
   *
   * @example ["users:view", "users:create", "roles:view"]
   */
  permissions: string[];
  /**
   * The current user's ID.
   * Used for self-access checks like { id: userId }.
   */
  userId: string;
}
