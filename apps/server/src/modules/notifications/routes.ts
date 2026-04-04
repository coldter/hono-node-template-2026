import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";

import {
  getNotificationResponseSchema,
  getPreferencesResponseSchema,
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
  listPushTokensResponseSchema,
  markReadResponseSchema,
  notificationParamsSchema,
  pushTokenParamsSchema,
  registerPushTokenBodySchema,
  registerPushTokenResponseSchema,
  successResponseSchema,
  unreadCountResponseSchema,
  updatePreferencesBodySchema,
  updatePreferencesResponseSchema,
} from "./schema";

const notificationsRoutes = {
  // ─────────────────────────────────────────────────────────────
  // LIST NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────
  listNotifications: createRouteConfig({
    operationId: "listNotifications",
    method: "get",
    path: "/",
    guard: authorize("notification", "list"),
    tags: ["notifications"],
    summary: "List notifications",
    description:
      "Returns a paginated list of notifications for the authenticated user",
    request: {
      query: listNotificationsQuerySchema,
    },
    responses: {
      200: {
        description: "Notifications retrieved successfully",
        content: {
          "application/json": { schema: listNotificationsResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // GET NOTIFICATION
  // ─────────────────────────────────────────────────────────────
  getNotification: createRouteConfig({
    operationId: "getNotification",
    method: "get",
    path: "/{notificationId}",
    guard: authorize("notification", "view"),
    tags: ["notifications"],
    summary: "Get notification details",
    description: "Returns details of a specific notification",
    request: {
      params: notificationParamsSchema,
    },
    responses: {
      200: {
        description: "Notification retrieved successfully",
        content: {
          "application/json": { schema: getNotificationResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // GET UNREAD COUNT
  // ─────────────────────────────────────────────────────────────
  getUnreadCount: createRouteConfig({
    operationId: "getUnreadNotificationCount",
    method: "get",
    path: "/unread/count",
    guard: authorize("notification", "get-unread-count"),
    tags: ["notifications"],
    summary: "Get unread notification count",
    description: "Returns the number of unread notifications for the user",
    responses: {
      200: {
        description: "Unread count retrieved successfully",
        content: {
          "application/json": { schema: unreadCountResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // MARK AS READ
  // ─────────────────────────────────────────────────────────────
  markAsRead: createRouteConfig({
    operationId: "markNotificationAsRead",
    method: "post",
    path: "/{notificationId}/read",
    guard: authorize("notification", "mark-read"),
    tags: ["notifications"],
    summary: "Mark notification as read",
    description: "Marks a specific notification as read",
    request: {
      params: notificationParamsSchema,
    },
    responses: {
      200: {
        description: "Notification marked as read",
        content: {
          "application/json": { schema: successResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // MARK ALL AS READ
  // ─────────────────────────────────────────────────────────────
  markAllAsRead: createRouteConfig({
    operationId: "markAllNotificationsAsRead",
    method: "post",
    path: "/read-all",
    guard: authorize("notification", "mark-all-read"),
    tags: ["notifications"],
    summary: "Mark all notifications as read",
    description: "Marks all notifications as read for the authenticated user",
    responses: {
      200: {
        description: "All notifications marked as read",
        content: {
          "application/json": { schema: markReadResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // GET PREFERENCES
  // ─────────────────────────────────────────────────────────────
  getPreferences: createRouteConfig({
    operationId: "getNotificationPreferences",
    method: "get",
    path: "/preferences",
    guard: authorize("notification", "get-preferences"),
    tags: ["notifications"],
    summary: "Get notification preferences",
    description: "Returns notification preferences for the authenticated user",
    responses: {
      200: {
        description: "Preferences retrieved successfully",
        content: {
          "application/json": { schema: getPreferencesResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // UPDATE PREFERENCES
  // ─────────────────────────────────────────────────────────────
  updatePreferences: createRouteConfig({
    operationId: "updateNotificationPreferences",
    method: "patch",
    path: "/preferences",
    guard: authorize("notification", "update-preferences"),
    tags: ["notifications"],
    summary: "Update notification preferences",
    description: "Updates notification preferences for the authenticated user",
    request: {
      body: {
        content: {
          "application/json": { schema: updatePreferencesBodySchema },
        },
      },
    },
    responses: {
      200: {
        description: "Preferences updated successfully",
        content: {
          "application/json": { schema: updatePreferencesResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // LIST PUSH TOKENS
  // ─────────────────────────────────────────────────────────────
  listPushTokens: createRouteConfig({
    operationId: "listPushTokens",
    method: "get",
    path: "/push-tokens",
    guard: authorize("notification", "list-push-tokens"),
    tags: ["notifications"],
    summary: "List push tokens",
    description:
      "Returns all registered push tokens for the authenticated user",
    responses: {
      200: {
        description: "Push tokens retrieved successfully",
        content: {
          "application/json": { schema: listPushTokensResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // REGISTER PUSH TOKEN
  // ─────────────────────────────────────────────────────────────
  registerPushToken: createRouteConfig({
    operationId: "registerPushToken",
    method: "post",
    path: "/push-tokens",
    guard: authorize("notification", "register-push-token"),
    tags: ["notifications"],
    summary: "Register push token",
    description:
      "Registers a new push token for the authenticated user's device",
    request: {
      body: {
        content: {
          "application/json": { schema: registerPushTokenBodySchema },
        },
      },
    },
    responses: {
      201: {
        description: "Push token registered successfully",
        content: {
          "application/json": { schema: registerPushTokenResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),

  // ─────────────────────────────────────────────────────────────
  // DELETE PUSH TOKEN
  // ─────────────────────────────────────────────────────────────
  deletePushToken: createRouteConfig({
    operationId: "deletePushToken",
    method: "delete",
    path: "/push-tokens/{tokenId}",
    guard: authorize("notification", "delete-push-token"),
    tags: ["notifications"],
    summary: "Delete push token",
    description: "Deactivates a push token for the authenticated user",
    request: {
      params: pushTokenParamsSchema,
    },
    responses: {
      200: {
        description: "Push token deleted successfully",
        content: {
          "application/json": { schema: successResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),
};

export default notificationsRoutes;
