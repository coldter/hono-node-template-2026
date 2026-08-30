import { AuthorizationError, type Principal } from "@repo/authorization";
import {
  authorization,
  buildAuthorizationPrincipal,
  toBaseAuthorizationPrincipal,
} from "@repo/shared/authorization";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";
import { UserNotFoundError } from "@/modules/users/errors";
import { userService } from "@/modules/users/service";

type ManageUserStatusAction = "activate" | "deactivate" | "unlock";

type AuthSessionUser = {
  email?: string;
  emailVerified?: boolean;
  id: string;
  roleSlugs?: string[];
  status?: string;
};

type AuthEndpointCtx = {
  context: { session: { user: { id: string } } };
};

function getAuthSessionUser(ctx: AuthEndpointCtx): AuthSessionUser {
  return ctx.context.session.user as AuthSessionUser;
}

const EMPTY_AUDIT_CONTEXT = {
  ipAddress: undefined,
  userAgent: undefined,
};

function getAuthorizationActor(user: AuthSessionUser) {
  return {
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    roleSlugs: user.roleSlugs ?? [],
    status: user.status,
  };
}

async function assertCanManageUserStatusWithApiError(
  actor: AuthSessionUser,
  action: ManageUserStatusAction,
  targetUserId: string
) {
  try {
    await assertCanManageUserStatus(actor, action, targetUserId);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw new APIError("FORBIDDEN", {
        cause: error,
        message: "Permission denied",
      });
    }
    throw error;
  }
}

async function runUserStatusMutationWithApiError(
  mutation: () => Promise<void>
): Promise<void> {
  try {
    await mutation();
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      throw new APIError("NOT_FOUND", {
        cause: error,
        message: "User not found",
      });
    }
    throw error;
  }
}

export const adminPlugin = () =>
  ({
    endpoints: {
      activateUser: createAuthEndpoint(
        "/admin/activate-user",
        {
          body: z.object({
            userId: z.string().min(1),
          }),
          metadata: {
            openapi: {
              description:
                "Sets user status to active and clears deactivation info",
              operationId: "activateUser",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        properties: {
                          success: { type: "boolean" },
                        },
                        type: "object",
                      },
                    },
                  },
                  description: "User activated successfully",
                },
              },
              summary: "Activate a user",
            },
          },
          method: "POST",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const currentUser = getAuthSessionUser(ctx);

          await assertCanManageUserStatusWithApiError(
            currentUser,
            "activate",
            ctx.body.userId
          );

          await runUserStatusMutationWithApiError(() =>
            userService.activate(
              ctx.body.userId,
              currentUser.id,
              EMPTY_AUDIT_CONTEXT
            )
          );

          return ctx.json({ success: true });
        }
      ),
      deactivateUser: createAuthEndpoint(
        "/admin/deactivate-user",
        {
          body: z.object({
            reason: z.string().optional(),
            userId: z.string().min(1),
          }),
          metadata: {
            openapi: {
              description:
                "Sets user status to inactive and revokes all sessions",
              operationId: "deactivateUser",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        properties: {
                          success: { type: "boolean" },
                        },
                        type: "object",
                      },
                    },
                  },
                  description: "User deactivated successfully",
                },
              },
              summary: "Deactivate a user",
            },
          },
          method: "POST",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const currentUser = getAuthSessionUser(ctx);

          await assertCanManageUserStatusWithApiError(
            currentUser,
            "deactivate",
            ctx.body.userId
          );

          if (ctx.body.userId === currentUser.id) {
            throw new APIError("BAD_REQUEST", {
              message: "Cannot deactivate yourself",
            });
          }

          await runUserStatusMutationWithApiError(() =>
            userService.deactivate(
              ctx.body.userId,
              ctx.body.reason ?? null,
              currentUser.id,
              EMPTY_AUDIT_CONTEXT
            )
          );
          return ctx.json({ success: true });
        }
      ),

      unlockUser: createAuthEndpoint(
        "/admin/unlock-user",
        {
          body: z.object({
            userId: z.string().min(1),
          }),
          metadata: {
            openapi: {
              description: "Resets lockout status and failed login attempts",
              operationId: "unlockUser",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        properties: {
                          success: { type: "boolean" },
                        },
                        type: "object",
                      },
                    },
                  },
                  description: "User unlocked successfully",
                },
              },
              summary: "Unlock a user",
            },
          },
          method: "POST",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const currentUser = getAuthSessionUser(ctx);

          await assertCanManageUserStatusWithApiError(
            currentUser,
            "unlock",
            ctx.body.userId
          );

          await runUserStatusMutationWithApiError(() =>
            userService.unlock(
              ctx.body.userId,
              currentUser.id,
              EMPTY_AUDIT_CONTEXT
            )
          );

          return ctx.json({ success: true });
        }
      ),
    },
    id: "admin",
  }) satisfies BetterAuthPlugin;

export async function assertCanManageUserStatus(
  actor: AuthSessionUser,
  action: ManageUserStatusAction,
  targetUserId: string
) {
  const principal = buildAuthorizationPrincipal(getAuthorizationActor(actor));
  const basePrincipal: Principal = toBaseAuthorizationPrincipal(principal);

  await authorization.assertCan(basePrincipal, "user", action, {
    resource: { id: targetUserId },
  });
}
