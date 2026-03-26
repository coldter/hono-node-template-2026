import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";

export const USER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  LOCKED: "locked",
  DELETED: "deleted",
} as const;

export const USER_STATUS_VALUES = Object.values(USER_STATUS) as [
  (typeof USER_STATUS)[keyof typeof USER_STATUS],
  ...(typeof USER_STATUS)[keyof typeof USER_STATUS][],
];

export const userStatusSchema = z.enum(USER_STATUS_VALUES);

export type UserWithStatusFields = {
  status: z.infer<typeof userStatusSchema>;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivatedReason: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  roleSlugs: string[];
  onboardingCompletedAt: Date | null;
  twoFactorEnabled: boolean;
};

/**
 * User Status Plugin
 *
 * Extends the user schema with:
 * - Status tracking (active, inactive, locked, deleted)
 * - Deactivation tracking (who, when, why)
 * - Lockout tracking (failed attempts, lockout expiry)
 * - Role assignment (roleSlugs array)
 *
 * !important: fieldName must match the column name in the database adapter schema not necessarily the column name in the database schema
 */
export const enhancedUserPlugin = () => {
  return {
    id: "user-status",
    schema: {
      user: {
        fields: {
          // Status field - determines if user can login
          status: {
            type: "string",
            fieldName: "status",
            required: true,
            defaultValue: "active",
            input: false,
          },
          // Deactivation tracking - when admin deactivates a user
          deactivatedAt: {
            type: "date",
            fieldName: "deactivatedAt",
            required: false,
            input: false,
          },
          deactivatedBy: {
            type: "string",
            fieldName: "deactivatedBy",
            required: false,
            input: false,
          },
          deactivatedReason: {
            type: "string",
            fieldName: "deactivatedReason",
            required: false,
            input: false,
          },
          // Lockout tracking - for failed login attempts
          failedLoginAttempts: {
            type: "number",
            fieldName: "failedLoginAttempts",
            required: true,
            defaultValue: 0,
            input: false,
          },
          lockedUntil: {
            type: "date",
            fieldName: "lockedUntil",
            required: false,
            input: false,
          },
          // Role assignment - array of role slugs
          roleSlugs: {
            type: "string[]",
            fieldName: "roleSlugs",
            required: true,
            defaultValue: [],
            input: false,
          },
          // Onboarding tracking - when user completed onboarding
          onboardingCompletedAt: {
            type: "date",
            fieldName: "onboardingCompletedAt",
            required: false,
            input: false,
          },
          // Two-factor authentication status (managed by twoFactor plugin)
          twoFactorEnabled: {
            type: "boolean",
            fieldName: "twoFactorEnabled",
            required: true,
            defaultValue: false,
            input: false,
          },
        },
      },
    },
  } satisfies BetterAuthPlugin;
};
