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
  deletePushToken: createRouteConfig({
    description: "Deactivates a push token for the authenticated user",
    guard: authorize("notification", "delete-push-token"),
    method: "delete",
    operationId: "deletePushToken",
    path: "/push-tokens/{tokenId}",
    request: {
      params: pushTokenParamsSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: successResponseSchema },
        },
        description: "Push token deleted successfully",
      },
      ...commonErrorResponses,
    },
    summary: "Delete push token",
    tags: ["notifications"],
  }),

  getNotification: createRouteConfig({
    description: "Returns details of a specific notification",
    guard: authorize("notification", "view"),
    method: "get",
    operationId: "getNotification",
    path: "/{notificationId}",
    request: {
      params: notificationParamsSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: getNotificationResponseSchema },
        },
        description: "Notification retrieved successfully",
      },
      ...commonErrorResponses,
    },
    summary: "Get notification details",
    tags: ["notifications"],
  }),

  getPreferences: createRouteConfig({
    description: "Returns notification preferences for the authenticated user",
    guard: authorize("notification", "get-preferences"),
    method: "get",
    operationId: "getNotificationPreferences",
    path: "/preferences",
    responses: {
      200: {
        content: {
          "application/json": { schema: getPreferencesResponseSchema },
        },
        description: "Preferences retrieved successfully",
      },
      ...commonErrorResponses,
    },
    summary: "Get notification preferences",
    tags: ["notifications"],
  }),

  getUnreadCount: createRouteConfig({
    description: "Returns the number of unread notifications for the user",
    guard: authorize("notification", "get-unread-count"),
    method: "get",
    operationId: "getUnreadNotificationCount",
    path: "/unread/count",
    responses: {
      200: {
        content: {
          "application/json": { schema: unreadCountResponseSchema },
        },
        description: "Unread count retrieved successfully",
      },
      ...commonErrorResponses,
    },
    summary: "Get unread notification count",
    tags: ["notifications"],
  }),
  listNotifications: createRouteConfig({
    description:
      "Returns a paginated list of notifications for the authenticated user",
    guard: authorize("notification", "list"),
    method: "get",
    operationId: "listNotifications",
    path: "/",
    request: {
      query: listNotificationsQuerySchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: listNotificationsResponseSchema },
        },
        description: "Notifications retrieved successfully",
      },
      ...commonErrorResponses,
    },
    summary: "List notifications",
    tags: ["notifications"],
  }),

  listPushTokens: createRouteConfig({
    description:
      "Returns all registered push tokens for the authenticated user",
    guard: authorize("notification", "list-push-tokens"),
    method: "get",
    operationId: "listPushTokens",
    path: "/push-tokens",
    responses: {
      200: {
        content: {
          "application/json": { schema: listPushTokensResponseSchema },
        },
        description: "Push tokens retrieved successfully",
      },
      ...commonErrorResponses,
    },
    summary: "List push tokens",
    tags: ["notifications"],
  }),

  markAllAsRead: createRouteConfig({
    description: "Marks all notifications as read for the authenticated user",
    guard: authorize("notification", "mark-all-read"),
    method: "post",
    operationId: "markAllNotificationsAsRead",
    path: "/read-all",
    responses: {
      200: {
        content: {
          "application/json": { schema: markReadResponseSchema },
        },
        description: "All notifications marked as read",
      },
      ...commonErrorResponses,
    },
    summary: "Mark all notifications as read",
    tags: ["notifications"],
  }),

  markAsRead: createRouteConfig({
    description: "Marks a specific notification as read",
    guard: authorize("notification", "mark-read"),
    method: "post",
    operationId: "markNotificationAsRead",
    path: "/{notificationId}/read",
    request: {
      params: notificationParamsSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: successResponseSchema },
        },
        description: "Notification marked as read",
      },
      ...commonErrorResponses,
    },
    summary: "Mark notification as read",
    tags: ["notifications"],
  }),

  registerPushToken: createRouteConfig({
    description:
      "Registers a new push token for the authenticated user's device",
    guard: authorize("notification", "register-push-token"),
    method: "post",
    operationId: "registerPushToken",
    path: "/push-tokens",
    request: {
      body: {
        content: {
          "application/json": { schema: registerPushTokenBodySchema },
        },
      },
    },
    responses: {
      201: {
        content: {
          "application/json": { schema: registerPushTokenResponseSchema },
        },
        description: "Push token registered successfully",
      },
      ...commonErrorResponses,
    },
    summary: "Register push token",
    tags: ["notifications"],
  }),

  updatePreferences: createRouteConfig({
    description: "Updates notification preferences for the authenticated user",
    guard: authorize("notification", "update-preferences"),
    method: "patch",
    operationId: "updateNotificationPreferences",
    path: "/preferences",
    request: {
      body: {
        content: {
          "application/json": { schema: updatePreferencesBodySchema },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": { schema: updatePreferencesResponseSchema },
        },
        description: "Preferences updated successfully",
      },
      ...commonErrorResponses,
    },
    summary: "Update notification preferences",
    tags: ["notifications"],
  }),
};

export default notificationsRoutes;
