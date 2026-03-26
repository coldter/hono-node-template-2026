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

// ============================================================
// RESPONSE FORMATTERS
// ============================================================

/**
 * Format notification for API response.
 */
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

/**
 * Format push token for API response.
 */
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

/**
 * Format preferences for API response.
 * Aggregates multiple preference records into a single summary.
 */
export function formatPreferencesSummary(
  preferences: PreferencesRecord[]
): PreferencesSummary {
  // Find global preferences (pattern "*" or "global")
  const globalPrefs = preferences.find(
    (p) => p.typePattern === "*" || p.typePattern === "global"
  );

  // Build type overrides from non-global preferences
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

// ============================================================
// REQUEST CONTEXT HELPERS
// ============================================================

/**
 * Get audit context from Hono context.
 */
export function getAuditContext(c: Context<Env>): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  return {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
    userAgent: c.req.header("user-agent"),
  };
}

/**
 * Get current user ID from context.
 * Throws if user is not authenticated.
 */
export function requireUserId(c: Context<Env>): string {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Authentication required" });
  }
  return user.id;
}

/**
 * Get current session ID from context.
 * Throws if session is not available.
 */
export function requireSessionId(c: Context<Env>): string {
  const session = c.get("session");
  if (!session) {
    throw new HTTPException(401, { message: "Session not available" });
  }
  return session.id;
}

// ============================================================
// PREFERENCE RESOLUTION
// ============================================================

/**
 * Resolve which channels are enabled for a given notification type based on user preferences.
 * Priority: exact type match > wildcard "*" > defaults (all enabled).
 */
export function resolveEnabledChannels(
  preferences: PreferencesRecord[],
  notificationType: string,
  requestedChannels: NotificationChannel[]
): NotificationChannel[] {
  // Find most specific preference: exact type match first, then wildcard
  const exactMatch = preferences.find(
    (p) => p.typePattern === notificationType
  );
  const wildcardMatch = preferences.find((p) => p.typePattern === "*");
  const prefs = exactMatch ?? wildcardMatch;

  if (!prefs) {
    // No preferences set, allow all requested channels
    return requestedChannels;
  }

  const channelEnabled: Record<NotificationChannel, boolean> = {
    email: prefs.emailEnabled,
    sms: prefs.smsEnabled,
    push: prefs.pushEnabled,
  };

  return requestedChannels.filter((channel) => channelEnabled[channel]);
}
