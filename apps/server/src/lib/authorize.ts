/**
 * Authorization Utilities
 *
 * Simple helpers for checking CASL abilities in route handlers.
 *
 * @example
 * ```typescript
 * import { authorize, hasAbility } from "@/lib/authorize";
 *
 * // In route handler:
 * const ability = c.get("ability");
 *
 * // Type guard
 * if (!hasAbility(ability)) {
 *   throw new HTTPException(401, { message: "Unauthorized" });
 * }
 *
 * // Check permission (throws 403 if denied)
 * authorize(ability, "read", "User");
 * ```
 */

import { subject } from "@casl/ability";
import type {
  Actions,
  AppAbility,
  Subjects,
  SubjectTypes,
} from "@repo/shared/abilities";
import { HTTPException } from "hono/http-exception";

// ============================================================
// CORE AUTHORIZATION FUNCTIONS
// ============================================================

/**
 * Throws 403 Forbidden if the ability doesn't allow the action.
 *
 * @param ability - The CASL ability instance
 * @param action - The action to check (read, create, update, delete)
 * @param subjectType - The subject type name (e.g., User)
 * @throws HTTPException with status 403 if not allowed
 *
 * @example
 * ```typescript
 * authorize(ability, "read", "User"); // Throws 403 if denied
 * ```
 */
export function authorize(
  ability: AppAbility,
  action: Actions,
  subjectType: SubjectTypes
): void {
  if (!ability.can(action, subjectType)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

/**
 * Throws 403 if the ability doesn't allow the action on a specific entity.
 *
 * @param ability - The CASL ability instance
 * @param action - The action to check
 * @param subjectType - The subject type name (e.g., User)
 * @param entity - The entity instance to check
 * @throws HTTPException with status 403 if not allowed
 *
 * @example
 * ```typescript
 * authorizeEntity(ability, "update", "User", { id: userId });
 * ```
 */
export function authorizeEntity<T extends Record<string, unknown>>(
  ability: AppAbility,
  action: Actions,
  subjectType: SubjectTypes,
  entity: T
): void {
  if (
    !ability.can(action, subject(subjectType, entity) as unknown as Subjects)
  ) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

/**
 * Checks if the ability allows the action (non-throwing).
 *
 * @param ability - The CASL ability instance
 * @param action - The action to check
 * @param subjectType - The subject type name
 * @returns true if allowed, false otherwise
 */
export function canAccess(
  ability: AppAbility,
  action: Actions,
  subjectType: SubjectTypes
): boolean {
  return ability.can(action, subjectType);
}

/**
 * Checks if the ability allows the action on a specific entity (non-throwing).
 *
 * @param ability - The CASL ability instance
 * @param action - The action to check
 * @param subjectType - The subject type name
 * @param entity - The entity to check
 * @returns true if allowed, false otherwise
 */
export function canAccessEntity<T extends Record<string, unknown>>(
  ability: AppAbility,
  action: Actions,
  subjectType: SubjectTypes,
  entity: T
): boolean {
  return ability.can(
    action,
    subject(subjectType, entity) as unknown as Subjects
  );
}

// ============================================================
// HELPER EXPORTS
// ============================================================

/**
 * Re-export subject helper for convenience.
 * Use this to wrap entities when doing manual CASL checks.
 */
export { subject } from "@casl/ability";

/**
 * Type guard to check if ability is available.
 * Useful when ability might be null (unauthenticated requests).
 */
export function hasAbility(ability: AppAbility | null): ability is AppAbility {
  return ability !== null;
}

/**
 * Throws 401 if ability is null (user not authenticated).
 * Throws 403 if ability doesn't allow the action.
 */
export function requireAbility(
  ability: AppAbility | null,
  action: Actions,
  subjectType: SubjectTypes
): asserts ability is AppAbility {
  if (!ability) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  authorize(ability, action, subjectType);
}
