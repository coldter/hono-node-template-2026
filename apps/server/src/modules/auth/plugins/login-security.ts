import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import * as schema from "@/db/schema";

type UserEmail = string;

import {
  calculateLockoutExpiry,
  isLockoutExpired,
  LOCKOUT_CONFIG,
} from "../constants";
import { userStatusSchema } from "./user-status";

/**
 * Auth error codes for client handling
 */
export const AUTH_ERROR_CODES = {
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
} as const;

/**
 * Login Security Plugin
 *
 * Handles all login security concerns within better-auth's plugin system:
 * - User status validation (deleted, inactive, locked)
 * - Failed login attempt tracking
 * - Account lockout after max failed attempts
 * - Lockout expiry and auto-unlock
 * - Reset failed attempts on successful login
 */
export const loginSecurityPlugin = () => {
  return {
    id: "login-security",

    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { email?: string } | undefined;
            if (!body?.email) {
              return;
            }

            const existingUser = await db.query.users.findFirst({
              where: { email: { eq: body.email as UserEmail } },
              columns: { id: true },
            });

            if (existingUser) {
              throw new APIError("BAD_REQUEST", {
                message:
                  "A user with this email already exists. Please sign in instead.",
              });
            }
          }),
        },
        {
          matcher: (context) => context.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { email?: string } | undefined;
            if (!body?.email) {
              return;
            }

            const user = await db.query.users.findFirst({
              where: { email: { eq: body.email as UserEmail } },
            });

            if (!user) {
              return;
            }

            const statusResult = userStatusSchema.safeParse(user.status);
            const status = statusResult.success ? statusResult.data : "active";

            if (status === "deleted") {
              throw new APIError("FORBIDDEN", {
                message: "This account has been deleted",
                code: AUTH_ERROR_CODES.ACCOUNT_DELETED,
              });
            }

            if (status === "inactive") {
              throw new APIError("FORBIDDEN", {
                message:
                  "This account has been deactivated. Please contact support.",
                code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
              });
            }

            if (status === "locked") {
              if (!isLockoutExpired(user.lockedUntil)) {
                const remainingMinutes = user.lockedUntil
                  ? Math.ceil(
                      (user.lockedUntil.getTime() - Date.now()) / 60_000
                    )
                  : LOCKOUT_CONFIG.lockoutDurationMinutes;

                throw new APIError("TOO_MANY_REQUESTS", {
                  message: `Account is locked. Please try again in ${remainingMinutes} minute(s) or reset your password.`,
                  code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
                });
              }

              // Lockout expired - auto-unlock
              await db
                .update(schema.users)
                .set({
                  status: "active",
                  lockedUntil: null,
                  failedLoginAttempts: 0,
                })
                .where(eq(schema.users.id, user.id));
            }
          }),
        },
      ],
      after: [
        {
          matcher: (context) => context.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { email?: string } | undefined;
            if (!body?.email) {
              return;
            }

            const returned = ctx.context.returned;
            const isFailure = returned instanceof APIError;

            if (isFailure) {
              // Handle failed login attempt
              const user = await db.query.users.findFirst({
                where: { email: { eq: body.email as UserEmail } },
              });

              if (!user) {
                return;
              }

              const newFailedAttempts = (user.failedLoginAttempts ?? 0) + 1;
              const shouldLock =
                newFailedAttempts >= LOCKOUT_CONFIG.maxFailedAttempts;

              await db
                .update(schema.users)
                .set({
                  failedLoginAttempts: newFailedAttempts,
                  ...(shouldLock && {
                    status: "locked",
                    lockedUntil: calculateLockoutExpiry(),
                  }),
                })
                .where(eq(schema.users.id, user.id));

              // Return modified response with lockout info
              if (shouldLock) {
                throw new APIError("TOO_MANY_REQUESTS", {
                  message: `Account locked after ${LOCKOUT_CONFIG.maxFailedAttempts} failed attempts. Try again in ${LOCKOUT_CONFIG.lockoutDurationMinutes} minutes.`,
                  code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
                });
              }

              const remainingAttempts =
                LOCKOUT_CONFIG.maxFailedAttempts - newFailedAttempts;
              throw new APIError("UNAUTHORIZED", {
                message: `Invalid credentials. ${remainingAttempts} attempt(s) remaining.`,
                code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
                remainingAttempts,
              });
            }

            // Reset failed attempts on successful login
            await db
              .update(schema.users)
              .set({
                failedLoginAttempts: 0,
                lockedUntil: null,
              })
              .where(eq(schema.users.email, body.email));

            // Don't return anything - let the original response pass through
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
