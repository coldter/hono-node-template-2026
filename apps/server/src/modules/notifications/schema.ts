import { z } from "@hono/zod-openapi";

import {
  createPaginatedResponseSchema,
  paginationQuerySchema,
} from "@/utils/pagination";

import { NOTIFICATIONS_SORT_COLUMN_VALUES } from "./constants";

// ============================================================
// CONSTANTS FOR SCHEMAS
// ============================================================

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

// ============================================================
// PARAMS
// ============================================================

export const notificationParamsSchema = z.object({
  notificationId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "notificationId", in: "path" },
      description: "Notification ID",
      example: "ntf_abc123",
    }),
});

export const pushTokenParamsSchema = z.object({
  tokenId: z
    .string()
    .min(1)
    .openapi({
      param: { name: "tokenId", in: "path" },
      description: "Push token ID",
      example: "ptk_xyz789",
    }),
});

// ============================================================
// QUERY
// ============================================================

export const listNotificationsQuerySchema = z
  .object({
    type: z.string().optional().openapi({
      description: "Filter by notification type",
      example: "user.welcome",
    }),
    status: z.enum(NOTIFICATION_STATUS_VALUES).optional().openapi({
      description: "Filter by status",
    }),
    channel: z.enum(NOTIFICATION_CHANNEL_VALUES).optional().openapi({
      description: "Filter by channel",
    }),
    unreadOnly: z
      .string()
      .transform((val) => val === "true")
      .optional()
      .openapi({
        description: "Only return unread notifications",
      }),
    sort: z.enum(NOTIFICATIONS_SORT_COLUMN_VALUES).optional().openapi({
      description: "Sort by column",
    }),
  })
  .extend(paginationQuerySchema.omit({ sort: true }).shape);

// ============================================================
// RESPONSE SCHEMAS
// ============================================================

export const notificationSummarySchema = z.object({
  id: z.string().openapi({ description: "Notification ID" }),
  type: z.string().openapi({
    description: "Notification type",
    example: "user.welcome",
  }),
  channel: z.enum(NOTIFICATION_CHANNEL_VALUES).openapi({
    description: "Delivery channel",
  }),
  status: z.enum(NOTIFICATION_STATUS_VALUES).openapi({
    description: "Delivery status",
  }),
  priority: z.enum(NOTIFICATION_PRIORITY_VALUES).openapi({
    description: "Priority level",
  }),
  subject: z.string().nullable().openapi({
    description: "Notification subject/title",
  }),
  body: z.string().nullable().openapi({
    description: "Notification body text",
  }),
  props: z.record(z.string(), z.unknown()).nullable().openapi({
    description: "Additional props for templates",
  }),
  isRead: z.boolean().nullable().openapi({
    description:
      "Whether the notification has been read. null for channels where read tracking is not available (e.g. email)",
  }),
  readAt: z.string().datetime().nullable().openapi({
    description: "When the notification was read by the user",
  }),
  sentAt: z.string().datetime().nullable().openapi({
    description: "When notification was sent to provider",
  }),
  deliveredAt: z.string().datetime().nullable().openapi({
    description: "When notification was delivered to device",
  }),
  createdAt: z.string().datetime().openapi({
    description: "Created timestamp",
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

// ============================================================
// PUSH TOKEN SCHEMAS
// ============================================================

export const pushTokenSummarySchema = z.object({
  id: z.string().openapi({ description: "Push token ID" }),
  platform: z.enum(PUSH_PLATFORM_VALUES).openapi({
    description: "Device platform",
  }),
  deviceId: z.string().nullable().openapi({
    description: "Device identifier",
  }),
  deviceName: z.string().nullable().openapi({
    description: "Device name",
  }),
  isActive: z.boolean().openapi({
    description: "Whether token is active",
  }),
  lastUsedAt: z.string().datetime().nullable().openapi({
    description: "Last time token was used",
  }),
  createdAt: z.string().datetime().openapi({
    description: "Created timestamp",
  }),
  sessionId: z.string().openapi({ description: "Associated session ID" }),
});

export const listPushTokensResponseSchema = z.object({
  tokens: z.array(pushTokenSummarySchema),
});

export const registerPushTokenBodySchema = z.object({
  token: z.string().min(1).openapi({
    description: "FCM/APNs push token",
  }),
  platform: z.enum(PUSH_PLATFORM_VALUES).openapi({
    description: "Device platform",
    example: "ios",
  }),
  deviceId: z.string().optional().openapi({
    description: "Unique device identifier",
  }),
  deviceName: z.string().max(100).optional().openapi({
    description: "Human-readable device name",
    example: "iPhone 15 Pro",
  }),
});

export const registerPushTokenResponseSchema = z.object({
  token: pushTokenSummarySchema,
});

// ============================================================
// PREFERENCES SCHEMAS
// ============================================================

export const preferencesSummarySchema = z.object({
  emailEnabled: z.boolean().openapi({
    description: "Email notifications enabled",
  }),
  smsEnabled: z.boolean().openapi({
    description: "SMS notifications enabled",
  }),
  pushEnabled: z.boolean().openapi({
    description: "Push notifications enabled",
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
  smsEnabled: z.boolean().optional().openapi({
    description: "Enable SMS notifications",
  }),
  pushEnabled: z.boolean().optional().openapi({
    description: "Enable push notifications",
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

// ============================================================
// SUCCESS RESPONSE
// ============================================================

export const successResponseSchema = z.object({
  success: z.boolean().openapi({ description: "Operation success status" }),
});

export const markReadResponseSchema = z.object({
  success: z.boolean().openapi({ description: "Operation success status" }),
  markedCount: z.number().int().openapi({
    description: "Number of notifications marked as read",
  }),
});
