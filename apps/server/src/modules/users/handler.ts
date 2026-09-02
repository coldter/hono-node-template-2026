import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { isValidRole } from "@/auth/principal";
import { auth } from "@/auth/schema";
import type { Env } from "@/lib/context";
import { EVENTS, pushEvent } from "@/lib/events";
import { notificationService } from "@/modules/notifications";
import { defaultHook } from "@/utils/default-hook";
import { createPaginatedResponse } from "@/utils/pagination";
import { requireAuthorizedUserId } from "./auth-loader";
import {
  toMyAccountResponse,
  toUserDetailResponse,
  toUserSummaryResponse,
} from "./presenter";
import usersRoutes from "./routes";
import { userService } from "./service";

const app = new OpenAPIHono<Env>({ defaultHook });

function requireCurrentUser(
  c: Context<Env>
): NonNullable<Env["Variables"]["user"]> {
  const currentUser = c.get("user");
  if (!currentUser) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return currentUser;
}

function presentOrThrow<T extends { status: string }, R>(
  user: T,
  presenter: (u: T) => R | null
): R {
  const presented = presenter(user);
  if (presented === null) {
    throw new HTTPException(500, {
      message: `User status "${user.status}" is not a recognised value`,
    });
  }
  return presented;
}

const usersHandler = app
  .openapi(usersRoutes.listUsers, async (c) => {
    const query = c.req.valid("query");
    const result = await userService.find(query);

    const paginated = createPaginatedResponse({
      data: result.data,
      formatter: toUserSummaryResponse,
      query,
      total: result.meta.total,
    });

    return c.json(paginated, 200);
  })

  .openapi(usersRoutes.getMyAccount, async (c) => {
    const currentUser = requireCurrentUser(c);

    const [account, unreadCount] = await Promise.all([
      userService.findAccountSummaryById(currentUser.id),
      notificationService.getUnreadCount(currentUser.id),
    ]);

    if (!account) {
      throw new HTTPException(404, { message: "User not found" });
    }

    return c.json(
      {
        notifications: {
          unreadCount,
        },
        profile: toMyAccountResponse(account),
      },
      200
    );
  })

  .openapi(usersRoutes.getUser, async (c) => {
    const userId = requireAuthorizedUserId(c);
    const user = await userService.findDetailById(userId);

    if (!user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    return c.json({ user: presentOrThrow(user, toUserDetailResponse) }, 200);
  })

  .openapi(usersRoutes.createUser, async (c) => {
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    const invalidRoles = body.roleSlugs.filter((r) => !isValidRole(r));
    if (invalidRoles.length > 0) {
      throw new HTTPException(400, {
        message: `Invalid roles: ${invalidRoles.join(", ")}. Valid: ${auth.roleValues.join(", ")}`,
      });
    }

    const user = await userService.create(
      body,
      currentUser.id,
      c.var.auditContext
    );

    await pushEvent(EVENTS.USER_CREATED, {
      email: user.email,
      name: user.name,
      userId: user.id,
    });

    return c.json({ user: presentOrThrow(user, toUserSummaryResponse) }, 201);
  })

  .openapi(usersRoutes.updateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    const user = await userService.update(
      userId,
      body,
      currentUser.id,
      c.var.auditContext
    );
    return c.json({ user: presentOrThrow(user, toUserSummaryResponse) }, 200);
  })

  .openapi(usersRoutes.updateUserRoles, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    const invalidRoles = body.roleSlugs.filter((r) => !isValidRole(r));
    if (invalidRoles.length > 0) {
      throw new HTTPException(400, {
        message: `Invalid roles: ${invalidRoles.join(", ")}. Valid: ${auth.roleValues.join(", ")}`,
      });
    }

    const user = await userService.updateRoles(
      userId,
      body,
      currentUser.id,
      c.var.auditContext
    );
    return c.json({ user: presentOrThrow(user, toUserSummaryResponse) }, 200);
  })

  .openapi(usersRoutes.deactivateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    await userService.deactivate(
      userId,
      body.reason ?? null,
      currentUser.id,
      c.var.auditContext
    );

    return c.json({ success: true }, 200);
  })

  .openapi(usersRoutes.activateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const currentUser = requireCurrentUser(c);

    await userService.activate(userId, currentUser.id, c.var.auditContext);

    return c.json({ success: true }, 200);
  })

  .openapi(usersRoutes.unlockUser, async (c) => {
    const { userId } = c.req.valid("param");
    const currentUser = requireCurrentUser(c);

    await userService.unlock(userId, currentUser.id, c.var.auditContext);

    return c.json({ success: true }, 200);
  });

export default usersHandler;
