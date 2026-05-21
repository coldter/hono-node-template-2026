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

// IMPORTANT: fieldName must match the column name in the database adapter schema,
// not necessarily the column in the database schema.
export const enhancedUserPlugin = () => {
  return {
    id: "user-status",
    schema: {
      user: {
        fields: {
          status: {
            type: "string",
            fieldName: "status",
            required: true,
            defaultValue: "active",
            input: false,
          },
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
          roleSlugs: {
            type: "string[]",
            fieldName: "roleSlugs",
            required: true,
            defaultValue: [],
            input: false,
          },
          onboardingCompletedAt: {
            type: "date",
            fieldName: "onboardingCompletedAt",
            required: false,
            input: false,
          },
          // Managed by the twoFactor plugin.
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
