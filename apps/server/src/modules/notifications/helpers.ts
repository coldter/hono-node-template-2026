import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { Env } from "@/lib/context";

import type {
  NotificationChannel,
  NotificationRecord,
  NotificationSummary,
  PreferencesRecord,
  PreferencesSummary,
  PushTokenRecord,
  PushTokenSummary,
} from "./types";

export function formatNotificationSummary(
  notification: NotificationRecord
): NotificationSummary {
  const isReadTrackable = notification.channel === "push";

  return {
    body: notification.body,
    channel: notification.channel,
    createdAt: notification.createdAt.toISOString(),
    deliveredAt: notification.deliveredAt?.toISOString() ?? null,
    id: notification.id,
    isRead: isReadTrackable ? notification.readAt !== null : null,
    priority: notification.priority,
    props: notification.props,
    readAt: isReadTrackable
      ? (notification.readAt?.toISOString() ?? null)
      : null,
    sentAt: notification.sentAt?.toISOString() ?? null,
    status: notification.status,
    subject: notification.subject,
    type: notification.type,
  };
}

export function formatPushTokenSummary(
  token: PushTokenRecord
): PushTokenSummary {
  return {
    createdAt: token.createdAt.toISOString(),
    deviceId: token.deviceId,
    deviceName: token.deviceName,
    id: token.id,
    isActive: token.isActive,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    platform: token.platform,
    sessionId: token.sessionId,
  };
}

export function formatPreferencesSummary(
  preferences: PreferencesRecord[]
): PreferencesSummary {
  const globalPrefs = preferences.find(
    (p) => p.typePattern === "*" || p.typePattern === "global"
  );

  const typeOverrides: PreferencesSummary["typeOverrides"] = {};
  for (const pref of preferences) {
    if (pref.typePattern !== "*" && pref.typePattern !== "global") {
      const channels: ("email" | "sms" | "push")[] = [];
      if (pref.emailEnabled) {
        channels.push("email");
      }
      if (pref.smsEnabled) {
        channels.push("sms");
      }
      if (pref.pushEnabled) {
        channels.push("push");
      }

      typeOverrides[pref.typePattern] = {
        channels: channels.length > 0 ? channels : undefined,
        enabled: channels.length > 0,
      };
    }
  }

  return {
    emailEnabled: globalPrefs?.emailEnabled ?? true,
    pushEnabled: globalPrefs?.pushEnabled ?? true,
    smsEnabled: globalPrefs?.smsEnabled ?? false,
    typeOverrides: Object.keys(typeOverrides).length > 0 ? typeOverrides : null,
  };
}

export function requireUserId(c: Context<Env>): string {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  return user.id;
}

export function requireSessionId(c: Context<Env>): string {
  const session = c.get("session");
  if (!session) {
    throw new HTTPException(401, { message: "Session not available" });
  }
  return session.id;
}

export function resolveEnabledChannels(
  preferences: PreferencesRecord[],
  notificationType: string,
  requestedChannels: NotificationChannel[]
): NotificationChannel[] {
  const exactMatch = preferences.find(
    (p) => p.typePattern === notificationType
  );
  const wildcardMatch = preferences.find((p) => p.typePattern === "*");
  const prefs = exactMatch ?? wildcardMatch;

  if (!prefs) {
    return requestedChannels;
  }

  const channelEnabled: Record<NotificationChannel, boolean> = {
    email: prefs.emailEnabled,
    push: prefs.pushEnabled,
    sms: prefs.smsEnabled,
  };

  return requestedChannels.filter((channel) => channelEnabled[channel]);
}
