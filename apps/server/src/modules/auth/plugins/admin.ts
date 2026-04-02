import * as schema from "@repo/db/schema";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { hasPermission, PERMISSIONS } from "@/modules/auth/roles";
import { onUserStatusChange } from "@/modules/users/user-status-hooks";

type UserId = string;

/**
 * Admin Plugin
 *
 * Provides endpoints for user management:
 * - Deactivate user (admin sets user to inactive)
 * - Activate user (admin reactivates a user)
 * - Unlock user (admin unlocks a locked user)
 */
export const adminPlugin = () => {
  return {
    id: "admin",
    endpoints: {
      /**
       * Deactivate a user - sets status to "inactive"
       * Revokes all user sessions
       */
      deactivateUser: createAuthEndpoint(
        "/admin/deactivate-user",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({
            userId: z.string().min(1),
            reason: z.string().optional(),
          }),
          metadata: {
            openapi: {
              operationId: "deactivateUser",
              summary: "Deactivate a user",
              description:
                "Sets user status to inactive and revokes all sessions",
              responses: {
                200: {
                  description: "User deactivated successfully",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const currentUser = ctx.context.session.user;

          // Permission check
          const canDeactivate = await hasPermission(
            {
              roleSlugs:
                (currentUser as { roleSlugs?: string[] }).roleSlugs ?? [],
            },
            PERMISSIONS.USERS.DEACTIVATE
          );
          if (!canDeactivate) {
            throw new APIError("FORBIDDEN", { message: "Permission denied" });
          }

          // Cannot deactivate yourself
          if (ctx.body.userId === currentUser.id) {
            throw new APIError("BAD_REQUEST", {
              message: "Cannot deactivate yourself",
            });
          }

          // Check if user exists
          const targetUser = await db.query.users.findFirst({
            where: { id: { eq: ctx.body.userId as UserId } },
          });

          if (!targetUser) {
            throw new APIError("NOT_FOUND", { message: "User not found" });
          }

          // Update user status
          await db
            .update(schema.users)
            .set({
              status: "inactive",
              deactivatedAt: new Date(),
              deactivatedBy: currentUser.id,
              deactivatedReason: ctx.body.reason ?? null,
            })
            .where(eq(schema.users.id, ctx.body.userId));

          // Revoke all sessions for this user
          await db
            .delete(schema.sessions)
            .where(eq(schema.sessions.userId, ctx.body.userId));

          // Trigger status change hook for domain-specific side effects
          await onUserStatusChange(
            ctx.body.userId,
            "inactive",
            targetUser.status,
            ctx.body.reason ?? "admin_deactivated"
          );

          return ctx.json({ success: true });
        }
      ),

      /**
       * Activate a user - sets status back to "active"
       * Clears deactivation fields
       */
      activateUser: createAuthEndpoint(
        "/admin/activate-user",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({
            userId: z.string().min(1),
          }),
          metadata: {
            openapi: {
              operationId: "activateUser",
              summary: "Activate a user",
              description:
                "Sets user status to active and clears deactivation info",
              responses: {
                200: {
                  description: "User activated successfully",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const currentUser = ctx.context.session.user;

          // Permission check
          const canActivate = await hasPermission(
            {
              roleSlugs:
                (currentUser as { roleSlugs?: string[] }).roleSlugs ?? [],
            },
            PERMISSIONS.USERS.ACTIVATE
          );
          if (!canActivate) {
            throw new APIError("FORBIDDEN", { message: "Permission denied" });
          }

          // Check if user exists
          const targetUser = await db.query.users.findFirst({
            where: { id: { eq: ctx.body.userId as UserId } },
          });

          if (!targetUser) {
            throw new APIError("NOT_FOUND", { message: "User not found" });
          }

          // Update user status
          await db
            .update(schema.users)
            .set({
              status: "active",
              deactivatedAt: null,
              deactivatedBy: null,
              deactivatedReason: null,
            })
            .where(eq(schema.users.id, ctx.body.userId));

          // Trigger status change hook for domain-specific side effects
          await onUserStatusChange(
            ctx.body.userId,
            "active",
            targetUser.status,
            null
          );

          return ctx.json({ success: true });
        }
      ),

      /**
       * Unlock a user - resets lockout status
       * Clears failed login attempts and lockedUntil
       */
      unlockUser: createAuthEndpoint(
        "/admin/unlock-user",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({
            userId: z.string().min(1),
          }),
          metadata: {
            openapi: {
              operationId: "unlockUser",
              summary: "Unlock a user",
              description: "Resets lockout status and failed login attempts",
              responses: {
                200: {
                  description: "User unlocked successfully",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const currentUser = ctx.context.session.user;

          // Permission check
          const canUnlock = await hasPermission(
            {
              roleSlugs:
                (currentUser as { roleSlugs?: string[] }).roleSlugs ?? [],
            },
            PERMISSIONS.USERS.UNLOCK
          );
          if (!canUnlock) {
            throw new APIError("FORBIDDEN", { message: "Permission denied" });
          }

          // Check if user exists
          const targetUser = await db.query.users.findFirst({
            where: { id: { eq: ctx.body.userId as UserId } },
          });

          if (!targetUser) {
            throw new APIError("NOT_FOUND", { message: "User not found" });
          }

          // Reset lockout status
          await db
            .update(schema.users)
            .set({
              status: "active",
              lockedUntil: null,
              failedLoginAttempts: 0,
            })
            .where(eq(schema.users.id, ctx.body.userId));

          return ctx.json({ success: true });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
};
