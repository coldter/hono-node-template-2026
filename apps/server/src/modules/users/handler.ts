import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import { isValidRole } from "@/auth/principal";
import { auth } from "@/auth/schema";
import type { Env } from "@/lib/context";
import { EVENTS, pushEvent } from "@/lib/events";
import { notificationService } from "@/modules/notifications";
import { defaultHook } from "@/utils/default-hook";
import { UserNotFoundError } from "./errors";
import { getRequestContext } from "./helpers";
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

function handleUserNotFound(error: unknown): never {
  if (error instanceof UserNotFoundError) {
    throw new HTTPException(404, { message: "User not found" });
  }
  throw error;
}

const usersHandler = app
  .openapi(usersRoutes.listUsers, async (c) => {
    const query = c.req.valid("query");
    const result = await userService.find(query);

    return c.json(
      {
        data: result.data.map(toUserSummaryResponse),
        meta: result.meta,
      },
      200
    );
  })

  .openapi(usersRoutes.getMyAccount, async (c) => {
    const currentUser = requireCurrentUser(c);

    const account = await userService.findAccountSummaryById(currentUser.id);

    if (!account) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const unreadCount = await notificationService.getUnreadCount(account.id);

    return c.json(
      {
        profile: toMyAccountResponse(account),
        notifications: {
          unreadCount,
        },
      },
      200
    );
  })

  .openapi(usersRoutes.getUser, async (c) => {
    const { userId } = c.req.valid("param");
    const user = await userService.findById(userId);

    if (!user) {
      throw new HTTPException(404, { message: "User not found" });
    }

    return c.json({ user: toUserDetailResponse(user) }, 200);
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

    const auditContext = getRequestContext(c);
    const user = await userService.create(body, currentUser.id, auditContext);

    await pushEvent(EVENTS.USER_CREATED, {
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    return c.json({ user: toUserSummaryResponse(user) }, 201);
  })

  .openapi(usersRoutes.updateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    const auditContext = getRequestContext(c);

    try {
      const user = await userService.update(
        userId,
        body,
        currentUser.id,
        auditContext
      );
      return c.json({ user: toUserSummaryResponse(user) }, 200);
    } catch (error) {
      handleUserNotFound(error);
    }
  })

  .openapi(usersRoutes.updateUserRoles, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    if (userId === currentUser.id) {
      throw new HTTPException(400, {
        message: "Cannot modify your own roles",
      });
    }

    const invalidRoles = body.roleSlugs.filter((r) => !isValidRole(r));
    if (invalidRoles.length > 0) {
      throw new HTTPException(400, {
        message: `Invalid roles: ${invalidRoles.join(", ")}. Valid: ${auth.roleValues.join(", ")}`,
      });
    }

    const auditContext = getRequestContext(c);

    try {
      const user = await userService.updateRoles(
        userId,
        body,
        currentUser.id,
        auditContext
      );
      return c.json({ user: toUserSummaryResponse(user) }, 200);
    } catch (error) {
      handleUserNotFound(error);
    }
  })

  .openapi(usersRoutes.deactivateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = requireCurrentUser(c);

    if (userId === currentUser.id) {
      throw new HTTPException(400, { message: "Cannot deactivate yourself" });
    }

    const auditContext = getRequestContext(c);
    try {
      await userService.deactivate(
        userId,
        body.reason ?? null,
        currentUser.id,
        auditContext
      );
    } catch (error) {
      handleUserNotFound(error);
    }

    return c.json({ success: true }, 200);
  })

  .openapi(usersRoutes.activateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const currentUser = requireCurrentUser(c);

    const auditContext = getRequestContext(c);
    try {
      await userService.activate(userId, currentUser.id, auditContext);
    } catch (error) {
      handleUserNotFound(error);
    }

    return c.json({ success: true }, 200);
  })

  .openapi(usersRoutes.unlockUser, async (c) => {
    const { userId } = c.req.valid("param");
    const currentUser = requireCurrentUser(c);

    const auditContext = getRequestContext(c);
    try {
      await userService.unlock(userId, currentUser.id, auditContext);
    } catch (error) {
      handleUserNotFound(error);
    }

    return c.json({ success: true }, 200);
  });

export default usersHandler;
