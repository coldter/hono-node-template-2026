import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { isValidRole } from "@/auth/principal";
import { auth } from "@/auth/schema";
import type { Env } from "@/lib/context";
import { EVENTS, pushEvent } from "@/lib/events";
import { notificationService } from "@/modules/notifications";
import { defaultHook } from "@/utils/default-hook";
import { getRequestContext } from "./helpers";
import usersRoutes from "./routes";
import { userService } from "./service";
import type { UserStatus } from "./types";

const app = new OpenAPIHono<Env>({ defaultHook });

function formatUserForResponse(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  status: string;
  roleSlugs: string[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    status: user.status as UserStatus,
    roleSlugs: user.roleSlugs,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function formatUserDetailForResponse(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  status: string;
  roleSlugs: string[];
  createdAt: Date;
  updatedAt: Date;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivatedReason: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    status: user.status as UserStatus,
    roleSlugs: user.roleSlugs,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    deactivatedBy: user.deactivatedBy,
    deactivatedReason: user.deactivatedReason,
  };
}

function formatMyAccountForResponse(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

const usersHandler = app
  .openapi(usersRoutes.listUsers, async (c) => {
    const query = c.req.valid("query");
    const result = await userService.find(query);

    return c.json(
      {
        data: result.data.map(formatUserForResponse),
        meta: result.meta,
      },
      200
    );
  })

  .openapi(usersRoutes.getMyAccount, async (c) => {
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const account = await userService.findAccountSummaryById(currentUser.id);

    if (!account) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const unreadCount = await notificationService.getUnreadCount(account.id);

    return c.json(
      {
        profile: formatMyAccountForResponse(account),
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

    return c.json({ user: formatUserDetailForResponse(user) }, 200);
  })

  .openapi(usersRoutes.createUser, async (c) => {
    const body = c.req.valid("json");
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

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

    return c.json({ user: formatUserForResponse(user) }, 201);
  })

  .openapi(usersRoutes.updateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const auditContext = getRequestContext(c);

    try {
      const user = await userService.update(
        userId,
        body,
        currentUser.id,
        auditContext
      );
      return c.json({ user: formatUserForResponse(user) }, 200);
    } catch (error) {
      if (error instanceof Error && error.message === "User not found") {
        throw new HTTPException(404, { message: "User not found" });
      }
      throw error;
    }
  })

  .openapi(usersRoutes.updateUserRoles, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

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
      return c.json({ user: formatUserForResponse(user) }, 200);
    } catch (error) {
      if (error instanceof Error && error.message === "User not found") {
        throw new HTTPException(404, { message: "User not found" });
      }
      throw error;
    }
  })

  .openapi(usersRoutes.deactivateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    if (userId === currentUser.id) {
      throw new HTTPException(400, { message: "Cannot deactivate yourself" });
    }

    const targetUser = await userService.findById(userId);
    if (!targetUser) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const auditContext = getRequestContext(c);
    await userService.deactivate(
      userId,
      body.reason ?? null,
      currentUser.id,
      auditContext
    );

    return c.json({ success: true }, 200);
  })

  .openapi(usersRoutes.activateUser, async (c) => {
    const { userId } = c.req.valid("param");
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const targetUser = await userService.findById(userId);
    if (!targetUser) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const auditContext = getRequestContext(c);
    await userService.activate(userId, currentUser.id, auditContext);

    return c.json({ success: true }, 200);
  })

  .openapi(usersRoutes.unlockUser, async (c) => {
    const { userId } = c.req.valid("param");
    const currentUser = c.get("user");

    if (!currentUser) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const targetUser = await userService.findById(userId);
    if (!targetUser) {
      throw new HTTPException(404, { message: "User not found" });
    }

    const auditContext = getRequestContext(c);
    await userService.unlock(userId, currentUser.id, auditContext);

    return c.json({ success: true }, 200);
  });

export default usersHandler;
