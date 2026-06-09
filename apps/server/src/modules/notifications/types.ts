import type {
  Notification,
  NotificationChannel,
  NotificationPreference,
  NotificationPriority,
  NotificationStatus,
  PushPlatform,
  PushToken,
} from "@repo/db/schema";
import type { PaginationQuery } from "@/utils/pagination";
import type { NotificationsSortColumn, NotificationType } from "./constants";

export type {
  NotificationChannel,
  NotificationPriority,
  NotificationStatus,
  PushPlatform,
};

export interface ListNotificationsQuery extends PaginationQuery {
  channel?: NotificationChannel;
  sort?: NotificationsSortColumn;
  status?: NotificationStatus;
  type?: string;
  unreadOnly?: boolean;
}

export interface SendNotificationInput {
  body: string;
  /** Override default channels */
  channels?: NotificationChannel[];
  /** Override default priority */
  priority?: NotificationPriority;
  /** Additional props for templates/deep links */
  props?: Record<string, unknown>;
  subject: string;
  type: NotificationType;
  userId: string;
}

export interface RegisterPushTokenInput {
  deviceId?: string;
  deviceName?: string;
  platform: PushPlatform;
  /** FCM/APNs token */
  token: string;
}

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
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

export type NotificationRecord = Notification;

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

export type PushTokenRecord = PushToken;

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

export type PreferencesRecord = NotificationPreference;

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

export interface SendResult {
  /** Channels attempted */
  channels: NotificationChannel[];
  failedChannels: { channel: NotificationChannel; error: string }[];
  /** Notification IDs (one per channel) */
  notificationIds: string[];
  /** Successfully sent to channels */
  sentChannels: NotificationChannel[];
}
