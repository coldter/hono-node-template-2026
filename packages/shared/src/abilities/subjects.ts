/**
 * CASL Subject and Action Definitions
 *
 * Subjects are the entities that permissions apply to (User, etc.)
 * Actions are the operations that can be performed (read, update, delete, etc.)
 *
 * CASL supports two forms of subjects:
 * 1. String literal: "User" - for type-level checks without instance data
 * 2. Object with type: { type: "User", id: "user_1" } - for instance checks with conditions
 */

// ============================================================
// ACTIONS
// ============================================================

/**
 * Standard CRUD actions plus "manage" for full access.
 * "manage" is a special CASL action that matches any action.
 */
export type Actions = "create" | "read" | "update" | "delete" | "manage";

// ============================================================
// SUBJECT TYPE LITERALS
// ============================================================

/**
 * String literals for each subject type.
 * Used when checking permissions without a specific instance.
 *
 * @example
 * ability.can("read", "User") // Can user read users in general?
 */
export type SubjectTypes = "User" | "all"; // "all" is CASL's wildcard subject

// ============================================================
// SUBJECT INSTANCES
// ============================================================

/**
 * Base interface for all subject instances.
 * CASL requires a way to identify the subject type at runtime.
 */
interface BaseSubject {
  readonly __caslSubjectType__?: string;
}

/**
 * User subject instance type.
 * Includes fields for self-access and admin checks.
 */
export interface UserSubject extends BaseSubject {
  createdAt?: Date;
  deactivatedAt?: Date | null;
  deactivatedBy?: string | null;
  deactivatedReason?: string | null;
  email?: string;
  emailVerified?: boolean;
  failedLoginAttempts?: number;
  id: string;
  image?: string | null;
  lockedUntil?: Date | null;
  name?: string;
  roleSlugs?: string[];
  status?: string;
  updatedAt?: Date;
}

// ============================================================
// COMBINED SUBJECTS TYPE
// ============================================================

/**
 * Union of all possible subjects for CASL.
 *
 * This allows CASL to work with both:
 * - Type-level checks: ability.can("read", "User")
 * - Instance checks: ability.can("read", subject("User", userInstance))
 */
export type Subjects = SubjectTypes | UserSubject;

// ============================================================
// SUBJECT TYPE DETECTION
// ============================================================

/**
 * Map of subject type names to their detection functions.
 * CASL uses this to determine the type of a subject instance.
 *
 * This is needed because CASL needs to know what type of object
 * it's dealing with when checking conditions.
 */
export function detectSubjectType(
  subject: Exclude<Subjects, SubjectTypes>
): SubjectTypes | undefined {
  if (!subject || typeof subject !== "object") {
    return undefined;
  }

  // Check for explicit type marker (set by CASL's subject() helper)
  if ("__caslSubjectType__" in subject && subject.__caslSubjectType__) {
    return subject.__caslSubjectType__ as SubjectTypes;
  }

  // Heuristic detection based on field presence
  // This is a fallback - prefer using subject() helper
  if ("email" in subject && "roleSlugs" in subject) {
    return "User";
  }

  return undefined;
}
