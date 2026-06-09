import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";

import {
  formatNotificationSummary,
  formatPreferencesSummary,
  formatPushTokenSummary,
  requireSessionId,
  requireUserId,
} from "./helpers";
import notificationsRoutes from "./routes";
import { notificationService } from "./service";
import type { ListNotificationsQuery } from "./types";

const app = new OpenAPIHono<Env>({ defaultHook });

const notificationsHandler = app
  .openapi(notificationsRoutes.listNotifications, async (c) => {
    const userId = requireUserId(c);
    const query = c.req.valid("query");

    const result = await notificationService.listByUser(userId, {
      ...query,
      sort: query.sort as ListNotificationsQuery["sort"],
    });

    return c.json(
      {
        data: result.data.map(formatNotificationSummary),
        meta: result.meta,
      },
      200
    );
  })

  .openapi(notificationsRoutes.getPreferences, async (c) => {
    const userId = requireUserId(c);

    const preferences =
      await notificationService.ensureDefaultPreferences(userId);

    return c.json({ preferences: formatPreferencesSummary(preferences) }, 200);
  })

  .openapi(notificationsRoutes.getNotification, async (c) => {
    const userId = requireUserId(c);
    const { notificationId } = c.req.valid("param");

    const notification = await notificationService.findByIdAndUser(
      notificationId,
      userId
    );

    if (!notification) {
      throw new HTTPException(404, { message: "Notification not found" });
    }

    return c.json(
      { notification: formatNotificationSummary(notification) },
      200
    );
  })

  .openapi(notificationsRoutes.getUnreadCount, async (c) => {
    const userId = requireUserId(c);

    const count = await notificationService.getUnreadCount(userId);

    return c.json({ count }, 200);
  })

  .openapi(notificationsRoutes.markAsRead, async (c) => {
    const userId = requireUserId(c);
    const { notificationId } = c.req.valid("param");

    const notification = await notificationService.markAsRead(
      notificationId,
      userId
    );

    if (!notification) {
      throw new HTTPException(404, { message: "Notification not found" });
    }

    return c.json({ success: true }, 200);
  })

  .openapi(notificationsRoutes.markAllAsRead, async (c) => {
    const userId = requireUserId(c);

    const markedCount = await notificationService.markAllAsRead(userId);

    return c.json({ success: true, markedCount }, 200);
  })

  .openapi(notificationsRoutes.updatePreferences, async (c) => {
    const userId = requireUserId(c);
    const body = c.req.valid("json");

    const preferences = await notificationService.updatePreferences(
      userId,
      body
    );

    return c.json({ preferences: formatPreferencesSummary(preferences) }, 200);
  })

  .openapi(notificationsRoutes.listPushTokens, async (c) => {
    const userId = requireUserId(c);

    const tokens = await notificationService.listPushTokens(userId);

    return c.json({ tokens: tokens.map(formatPushTokenSummary) }, 200);
  })

  .openapi(notificationsRoutes.registerPushToken, async (c) => {
    const userId = requireUserId(c);
    const sessionId = requireSessionId(c);
    const body = c.req.valid("json");

    const token = await notificationService.registerPushToken(
      userId,
      sessionId,
      body
    );

    return c.json({ token: formatPushTokenSummary(token) }, 201);
  })

  .openapi(notificationsRoutes.deletePushToken, async (c) => {
    const userId = requireUserId(c);
    const { tokenId } = c.req.valid("param");

    const success = await notificationService.deactivatePushToken(
      tokenId,
      userId
    );

    if (!success) {
      throw new HTTPException(404, { message: "Push token not found" });
    }

    return c.json({ success: true }, 200);
  });

export default notificationsHandler;
