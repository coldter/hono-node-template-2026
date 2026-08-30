import { z } from "@hono/zod-openapi";

import {
  createPaginatedResponseSchema,
  paginationQuerySchema,
} from "@/utils/pagination";

import { NOTIFICATIONS_SORT_COLUMN_VALUES } from "./constants";

const NOTIFICATION_STATUS_VALUES = [
  "pending",
  "sent",
  "delivered",
  "failed",
  "cancelled",
] as const;

const NOTIFICATION_CHANNEL_VALUES = ["email", "sms", "push"] as const;

const NOTIFICATION_PRIORITY_VALUES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

const PUSH_PLATFORM_VALUES = ["ios", "android", "web"] as const;

export const notificationParamsSchema = z.object({
  notificationId: z
    .string()
    .min(1)
    .openapi({
      description: "Notification ID",
      example: "ntf_abc123",
      param: { in: "path", name: "notificationId" },
    }),
});

export const pushTokenParamsSchema = z.object({
  tokenId: z
    .string()
    .min(1)
    .openapi({
      description: "Push token ID",
      example: "ptk_xyz789",
      param: { in: "path", name: "tokenId" },
    }),
});

export const listNotificationsQuerySchema = z
  .object({
    channel: z.enum(NOTIFICATION_CHANNEL_VALUES).optional().openapi({
      description: "Filter by channel",
    }),
    sort: z.enum(NOTIFICATIONS_SORT_COLUMN_VALUES).optional().openapi({
      description: "Sort by column",
    }),
    status: z.enum(NOTIFICATION_STATUS_VALUES).optional().openapi({
      description: "Filter by status",
    }),
    type: z.string().optional().openapi({
      description: "Filter by notification type",
      example: "user.welcome",
    }),
    unreadOnly: z
      .string()
      .transform((val) => val === "true")
      .optional()
      .openapi({
        description: "Only return unread notifications",
      }),
  })
  .extend(paginationQuerySchema.omit({ sort: true }).shape);

export const notificationSummarySchema = z.object({
  body: z.string().nullable().openapi({
    description: "Notification body text",
  }),
  channel: z.enum(NOTIFICATION_CHANNEL_VALUES).openapi({
    description: "Delivery channel",
  }),
  createdAt: z.string().datetime().openapi({
    description: "Created timestamp",
  }),
  deliveredAt: z.string().datetime().nullable().openapi({
    description: "When notification was delivered to device",
  }),
  id: z.string().openapi({ description: "Notification ID" }),
  isRead: z.boolean().nullable().openapi({
    description:
      "Whether the notification has been read. null for channels where read tracking is not available (e.g. email)",
  }),
  priority: z.enum(NOTIFICATION_PRIORITY_VALUES).openapi({
    description: "Priority level",
  }),
  props: z.record(z.string(), z.unknown()).nullable().openapi({
    description: "Additional props for templates",
  }),
  readAt: z.string().datetime().nullable().openapi({
    description: "When the notification was read by the user",
  }),
  sentAt: z.string().datetime().nullable().openapi({
    description: "When notification was sent to provider",
  }),
  status: z.enum(NOTIFICATION_STATUS_VALUES).openapi({
    description: "Delivery status",
  }),
  subject: z.string().nullable().openapi({
    description: "Notification subject/title",
  }),
  type: z.string().openapi({
    description: "Notification type",
    example: "user.welcome",
  }),
});

export const listNotificationsResponseSchema = createPaginatedResponseSchema(
  notificationSummarySchema,
  "User notifications"
);

export const getNotificationResponseSchema = z.object({
  notification: notificationSummarySchema,
});

export const unreadCountResponseSchema = z.object({
  count: z.number().int().min(0).openapi({
    description: "Number of unread notifications",
    example: 5,
  }),
});

export const pushTokenSummarySchema = z.object({
  createdAt: z.string().datetime().openapi({
    description: "Created timestamp",
  }),
  deviceId: z.string().nullable().openapi({
    description: "Device identifier",
  }),
  deviceName: z.string().nullable().openapi({
    description: "Device name",
  }),
  id: z.string().openapi({ description: "Push token ID" }),
  isActive: z.boolean().openapi({
    description: "Whether token is active",
  }),
  lastUsedAt: z.string().datetime().nullable().openapi({
    description: "Last time token was used",
  }),
  platform: z.enum(PUSH_PLATFORM_VALUES).openapi({
    description: "Device platform",
  }),
  sessionId: z.string().openapi({ description: "Associated session ID" }),
});

export const listPushTokensResponseSchema = z.object({
  tokens: z.array(pushTokenSummarySchema),
});

export const registerPushTokenBodySchema = z.object({
  deviceId: z.string().optional().openapi({
    description: "Unique device identifier",
  }),
  deviceName: z.string().max(100).optional().openapi({
    description: "Human-readable device name",
    example: "iPhone 15 Pro",
  }),
  platform: z.enum(PUSH_PLATFORM_VALUES).openapi({
    description: "Device platform",
    example: "ios",
  }),
  token: z.string().min(1).openapi({
    description: "FCM/APNs push token",
  }),
});

export const registerPushTokenResponseSchema = z.object({
  token: pushTokenSummarySchema,
});

export const preferencesSummarySchema = z.object({
  emailEnabled: z.boolean().openapi({
    description: "Email notifications enabled",
  }),
  pushEnabled: z.boolean().openapi({
    description: "Push notifications enabled",
  }),
  smsEnabled: z.boolean().openapi({
    description: "SMS notifications enabled",
  }),
  typeOverrides: z
    .record(
      z.string(),
      z.object({
        channels: z.array(z.enum(NOTIFICATION_CHANNEL_VALUES)).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .nullable()
    .openapi({
      description: "Per-type notification preferences",
    }),
});

export const getPreferencesResponseSchema = z.object({
  preferences: preferencesSummarySchema,
});

export const updatePreferencesBodySchema = z.object({
  emailEnabled: z.boolean().optional().openapi({
    description: "Enable email notifications",
  }),
  pushEnabled: z.boolean().optional().openapi({
    description: "Enable push notifications",
  }),
  smsEnabled: z.boolean().optional().openapi({
    description: "Enable SMS notifications",
  }),
  typeOverrides: z
    .record(
      z.string(),
      z.object({
        channels: z.array(z.enum(NOTIFICATION_CHANNEL_VALUES)).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .optional()
    .openapi({
      description: "Per-type notification preferences",
    }),
});

export const updatePreferencesResponseSchema = z.object({
  preferences: preferencesSummarySchema,
});

export const successResponseSchema = z.object({
  success: z.boolean().openapi({ description: "Operation success status" }),
});

export const markReadResponseSchema = z.object({
  markedCount: z.number().int().openapi({
    description: "Number of notifications marked as read",
  }),
  success: z.boolean().openapi({ description: "Operation success status" }),
});
