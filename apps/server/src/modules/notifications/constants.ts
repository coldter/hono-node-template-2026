import type {
  NotificationChannel,
  NotificationPriority,
} from "@/db/schema/notifications";

// ============================================================
// NOTIFICATION TYPES
// ============================================================

/**
 * All notification type identifiers.
 * Pattern: "domain.event"
 */
export const NOTIFICATION_TYPES = {
  // System events
  USER_WELCOME: "user.welcome",
  SECURITY_LOGIN_NEW_DEVICE: "security.login_new_device",
  SECURITY_PASSWORD_CHANGED: "security.password_changed",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

// ============================================================
// DEFAULT CHANNELS PER TYPE
// ============================================================

interface NotificationTypeConfig {
  channels: NotificationChannel[];
  priority: NotificationPriority;
}

/**
 * Default channel and priority configuration per notification type.
 */
export const NOTIFICATION_TYPE_CONFIG: Record<
  NotificationType,
  NotificationTypeConfig
> = {
  // System events
  [NOTIFICATION_TYPES.USER_WELCOME]: {
    channels: ["email"],
    priority: "medium",
  },
  [NOTIFICATION_TYPES.SECURITY_LOGIN_NEW_DEVICE]: {
    channels: ["push", "email"],
    priority: "high",
  },
  [NOTIFICATION_TYPES.SECURITY_PASSWORD_CHANGED]: {
    channels: ["email"],
    priority: "high",
  },
} as const;

// ============================================================
// PAGINATION
// ============================================================

export const NOTIFICATIONS_LIST_LIMIT = 20;

// ============================================================
// SORT COLUMNS
// ============================================================

export const NOTIFICATIONS_SORT_COLUMNS = {
  createdAt: "createdAt",
  status: "status",
  type: "type",
} as const;

export type NotificationsSortColumn =
  (typeof NOTIFICATIONS_SORT_COLUMNS)[keyof typeof NOTIFICATIONS_SORT_COLUMNS];

export const NOTIFICATIONS_SORT_COLUMN_VALUES = Object.values(
  NOTIFICATIONS_SORT_COLUMNS
) as [string, ...string[]];
