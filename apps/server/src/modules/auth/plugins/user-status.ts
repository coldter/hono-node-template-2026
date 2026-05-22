import {
  USER_STATUS,
  USER_STATUS_VALUES,
  userStatusSchema,
} from "@repo/shared/users";
import type { BetterAuthPlugin } from "better-auth";
import type { z } from "zod";

export { USER_STATUS, USER_STATUS_VALUES, userStatusSchema };

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

// `fieldName` MUST match the database adapter's column name, which is not
// always the database schema's column name. Diverging breaks Better Auth reads.
export const enhancedUserPlugin = () =>
  ({
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
  }) satisfies BetterAuthPlugin;
