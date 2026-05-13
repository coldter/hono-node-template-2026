import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { Env } from "@/lib/context";
import { isAuthenticated } from "@/modules/auth/principal";

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
  // Only push supports read tracking; email and SMS return null/null
  const isReadTrackable = notification.channel === "push";

  return {
    id: notification.id,
    type: notification.type,
    channel: notification.channel,
    status: notification.status,
    priority: notification.priority,
    subject: notification.subject,
    body: notification.body,
    props: notification.props,
    isRead: isReadTrackable ? notification.readAt !== null : null,
    readAt: isReadTrackable
      ? (notification.readAt?.toISOString() ?? null)
      : null,
    sentAt: notification.sentAt?.toISOString() ?? null,
    deliveredAt: notification.deliveredAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

export function formatPushTokenSummary(
  token: PushTokenRecord
): PushTokenSummary {
  return {
    id: token.id,
    platform: token.platform,
    deviceId: token.deviceId,
    deviceName: token.deviceName,
    isActive: token.isActive,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
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
    smsEnabled: globalPrefs?.smsEnabled ?? false,
    pushEnabled: globalPrefs?.pushEnabled ?? true,
    typeOverrides: Object.keys(typeOverrides).length > 0 ? typeOverrides : null,
  };
}

export function requireUserId(c: Context<Env>): string {
  const principal = c.var.requestContext.principal;
  if (!isAuthenticated(principal)) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  return principal.userId;
}

export function requireSessionId(c: Context<Env>): string {
  const principal = c.var.requestContext.principal;
  if (!isAuthenticated(principal)) {
    throw new HTTPException(401, { message: "Session not available" });
  }
  return principal.session.id;
}

// Priority: exact type match > wildcard "*" > defaults (all enabled).
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
    sms: prefs.smsEnabled,
    push: prefs.pushEnabled,
  };

  return requestedChannels.filter((channel) => channelEnabled[channel]);
}
