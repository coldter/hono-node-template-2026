import type { NotificationPreference } from "@/db/schema/notification-preferences";
import type {
  Notification,
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
} from "@/db/schema/notifications";
import type { PushPlatform, PushToken } from "@/db/schema/push-tokens";
import type { PaginationQuery } from "@/utils/pagination";

import type { NotificationsSortColumn, NotificationType } from "./constants";

// Re-export schema types
export type {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  PushPlatform,
};

// ============================================================
// QUERY TYPES
// ============================================================

/**
 * Query params for listing notifications.
 */
export interface ListNotificationsQuery extends PaginationQuery {
  /** Filter by channel */
  channel?: NotificationChannel;
  /** Sort column */
  sort?: NotificationsSortColumn;
  /** Filter by status */
  status?: NotificationStatus;
  /** Filter by notification type */
  type?: string;
  /** Only unread notifications */
  unreadOnly?: boolean;
}

// ============================================================
// INPUT TYPES
// ============================================================

/**
 * Input for sending a notification.
 */
export interface SendNotificationInput {
  /** Notification body text */
  body: string;
  /** Override default channels */
  channels?: NotificationChannel[];
  /** Override default priority */
  priority?: NotificationPriority;
  /** Additional props for templates/deep links */
  props?: Record<string, unknown>;
  /** Notification subject/title */
  subject: string;
  /** Notification type */
  type: NotificationType;
  /** Target user ID */
  userId: string;
}

/**
 * Input for registering a push token.
 */
export interface RegisterPushTokenInput {
  /** Optional device identifier */
  deviceId?: string;
  /** Optional device name */
  deviceName?: string;
  /** Device platform */
  platform: PushPlatform;
  /** FCM/APNs token */
  token: string;
}

/**
 * Input for updating notification preferences.
 */
export interface UpdatePreferencesInput {
  /** Enable email notifications */
  emailEnabled?: boolean;
  /** Enable push notifications */
  pushEnabled?: boolean;
  /** Enable SMS notifications */
  smsEnabled?: boolean;
  /** Per-type pattern preferences (e.g., "security.*" -> { channels: ["push"] }) */
  typeOverrides?: Record<
    string,
    {
      channels?: NotificationChannel[];
      enabled?: boolean;
    }
  >;
}

// ============================================================
// RESPONSE TYPES
// ============================================================

/**
 * Notification record from database.
 */
export type NotificationRecord = Notification;

/**
 * Notification summary for API responses.
 */
export interface NotificationSummary {
  body: string | null;
  channel: NotificationChannel;
  createdAt: string;
  deliveredAt: string | null;
  id: string;
  isRead: boolean | null;
  priority: NotificationPriority;
  props: Record<string, unknown> | null;
  readAt: string | null;
  sentAt: string | null;
  status: NotificationStatus;
  subject: string | null;
  type: string;
}

/**
 * Push token record from database.
 */
export type PushTokenRecord = PushToken;

/**
 * Push token summary for API responses.
 */
export interface PushTokenSummary {
  createdAt: string;
  deviceId: string | null;
  deviceName: string | null;
  id: string;
  isActive: boolean;
  lastUsedAt: string | null;
  platform: PushPlatform;
  sessionId: string;
}

/**
 * User notification preferences.
 */
export type PreferencesRecord = NotificationPreference;

/**
 * Preferences summary for API responses.
 */
export interface PreferencesSummary {
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  typeOverrides: Record<
    string,
    {
      channels?: NotificationChannel[];
      enabled?: boolean;
    }
  > | null;
}

/**
 * Result of sending a notification.
 */
export interface SendResult {
  /** Channels attempted */
  channels: NotificationChannel[];
  /** Failed channels with errors */
  failedChannels: { channel: NotificationChannel; error: string }[];
  /** Notification IDs (one per channel) */
  notificationIds: string[];
  /** Successfully sent to channels */
  sentChannels: NotificationChannel[];
}
