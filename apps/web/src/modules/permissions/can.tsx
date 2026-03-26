/**
 * Can Component for conditional rendering based on CASL abilities.
 *
 * This component provides declarative permission checks in JSX.
 */

import type { Actions, Subjects, SubjectTypes } from "@repo/shared/abilities";
import type { ReactNode } from "react";
import { useAbility } from "./ability-context";

// ============================================================
// TYPES
// ============================================================

interface CanProps<S extends SubjectTypes> {
  /**
   * The subject to check against.
   * Can be a subject type string or a subject instance.
   */
  a: S | { __caslSubjectType__: S; [key: string]: unknown };
  /**
   * Content to render if the user has permission.
   */
  children: ReactNode;
  /**
   * Content to render if the user doesn't have permission.
   */
  fallback?: ReactNode;
  /**
   * Optional field to check permission for.
   */
  field?: string;
  /**
   * The action to check (e.g., "read", "create", "update", "delete")
   */
  I: Actions;
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * Renders children only if the user has the specified permission.
 *
 * @example
 * ```tsx
 * // Check permission on a subject type
 * <Can I="create" a="User">
 *   <CreateUserButton />
 * </Can>
 *
 * // Check permission on a specific instance
 * <Can I="update" a={subject("User", user)}>
 *   <EditUserButton />
 * </Can>
 *
 * // With fallback
 * <Can I="delete" a={subject("User", user)} fallback={<DisabledButton />}>
 *   <DeleteUserButton />
 * </Can>
 *
 * // Check specific field access
 * <Can I="read" a={subject("User", user)} field="email">
 *   <EmailDisplay value={user.email} />
 * </Can>
 * ```
 */
export function Can<S extends SubjectTypes>({
  I: action,
  a: subjectArg,
  field,
  children,
  fallback = null,
}: CanProps<S>) {
  const ability = useAbility();

  // Cast to the correct type for CASL
  const hasAccess = field
    ? ability.can(action, subjectArg as Subjects, field)
    : ability.can(action, subjectArg as Subjects);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// ============================================================
// CANNOT COMPONENT
// ============================================================

/**
 * Renders children only if the user does NOT have the specified permission.
 * This is the inverse of the Can component.
 *
 * @example
 * ```tsx
 * <Cannot I="delete" a={subject("User", user)}>
 *   <span>You cannot delete this user</span>
 * </Cannot>
 * ```
 */
export function Cannot<S extends SubjectTypes>({
  I: action,
  a: subjectArg,
  field,
  children,
  fallback = null,
}: CanProps<S>) {
  const ability = useAbility();

  const hasAccess = field
    ? ability.can(action, subjectArg as Subjects, field)
    : ability.can(action, subjectArg as Subjects);

  if (hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
