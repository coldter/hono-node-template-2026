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
import type { AuthSession } from "../instance";
import type { AuthenticatedPrincipal } from "../principal";
import { buildPrincipal } from "../principal";

type ManageUserStatusAction = "activate" | "deactivate" | "unlock";

const EMPTY_AUDIT_CONTEXT = {
  ipAddress: undefined,
  userAgent: undefined,
};

/**
 * Read the actor off a Better Auth endpoint context. `sessionMiddleware`
 * guarantees `ctx.context.session.user` is populated; we re-use the project
 * Principal Module to narrow it instead of redefining ad-hoc `AuthSessionUser`
 * shapes in three different endpoint handlers.
 *
 * boundary: BA's endpoint `ctx.context.session` carries the plugin-augmented
 * Session shape but its TS type is widened to `Session<...>` at the SDK
 * surface. Project-level `AuthSession` carries the literal-typed status enum;
 * we narrow via the same cast site as `auth-context.ts`.
 */
function actorFromCtx(ctx: {
  context: { session: { user: unknown; session: unknown } };
}): AuthenticatedPrincipal {
  // boundary: vendor-SDK generic variance — BA's endpoint session is the
  // same shape as the request session but typed loosely on the endpoint ctx.
  const sessionLike = {
    user: ctx.context.session.user,
    session: ctx.context.session.session,
  } as unknown as AuthSession;
  const principal = buildPrincipal(sessionLike);
  if (principal.kind !== "authenticated") {
    // sessionMiddleware would have already rejected this — defensive only.
    throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
  }
  return principal;
}

async function assertCanManageUserStatusWithApiError(
  actor: AuthenticatedPrincipal,
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
          const actor = actorFromCtx(ctx);

          await assertCanManageUserStatusWithApiError(
            actor,
            "deactivate",
            ctx.body.userId
          );

          if (ctx.body.userId === actor.userId) {
            throw new APIError("BAD_REQUEST", {
              message: "Cannot deactivate yourself",
            });
          }

          await runUserStatusMutationWithApiError(() =>
            userService.deactivate(
              ctx.body.userId,
              ctx.body.reason ?? null,
              actor.userId,
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
          const actor = actorFromCtx(ctx);

          await assertCanManageUserStatusWithApiError(
            actor,
            "activate",
            ctx.body.userId
          );

          await runUserStatusMutationWithApiError(() =>
            userService.activate(
              ctx.body.userId,
              actor.userId,
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
          const actor = actorFromCtx(ctx);

          await assertCanManageUserStatusWithApiError(
            actor,
            "unlock",
            ctx.body.userId
          );

          await runUserStatusMutationWithApiError(() =>
            userService.unlock(
              ctx.body.userId,
              actor.userId,
              EMPTY_AUDIT_CONTEXT
            )
          );

          return ctx.json({ success: true });
        }
      ),
    },
  }) satisfies BetterAuthPlugin;

export async function assertCanManageUserStatus(
  actor: AuthenticatedPrincipal,
  action: ManageUserStatusAction,
  targetUserId: string
) {
  const authzPrincipal = buildAuthorizationPrincipal(
    {
      id: actor.userId,
      email: actor.email,
      emailVerified: actor.emailVerified,
      roleSlugs: [...actor.roleSlugs],
      status: actor.status,
    },
    {
      activeOrganizationId: actor.activeOrganizationId,
      activeOrgRole: actor.activeOrgRole,
    }
  );
  const basePrincipal: Principal = toBaseAuthorizationPrincipal(authzPrincipal);

  await authorization.assertCan(basePrincipal, "user", action, {
    resource: { id: targetUserId },
  });
}
