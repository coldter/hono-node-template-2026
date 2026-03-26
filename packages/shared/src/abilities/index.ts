/**
 * Abilities Module - Public API
 *
 * This module provides a CASL-based permission system for authorization.
 *
 * @example
 * ```typescript
 * import {
 *   defineAbilityFor,
 *   subject,
 *   type AppAbility,
 *   type AbilityContext,
 * } from "@repo/shared/abilities";
 *
 * // Create ability for a user
 * const ability = defineAbilityFor({
 *   userId: "user_abc",
 *   permissions: ["users:view"],
 * });
 *
 * // Check permissions
 * ability.can("read", "User"); // true
 * ability.can("read", subject("User", { id: "user_abc", email: "a@b.com", roleSlugs: [] })); // true
 * ```
 */

// ────────────────────────────────────────────────────────────
// Main Factory & CASL Helpers
// ────────────────────────────────────────────────────────────

export { defineAbilityFor, subject } from "./define-ability";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type {
  Actions,
  Subjects,
  SubjectTypes,
  UserSubject,
} from "./subjects";
export { detectSubjectType } from "./subjects";
export type {
  AbilityContext,
  AppAbility,
  AppAbilityRule,
} from "./types";
