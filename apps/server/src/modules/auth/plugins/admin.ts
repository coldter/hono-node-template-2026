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
    id: user.id,
    roleSlugs: user.roleSlugs ?? [],
    status: user.status,
    email: user.email,
    emailVerified: user.emailVerified,
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
      throw new APIError("FORBIDDEN", { message: "Permission denied" });
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
      throw new APIError("NOT_FOUND", { message: "User not found" });
    }
    throw error;
  }
}

export const adminPlugin = () =>
  ({
    id: "admin",
    endpoints: {
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
