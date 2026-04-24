import {
  notificationPreferences,
  notifications,
  pushTokens,
} from "@repo/db/schema";
import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db";
import { EVENTS, pushEvent } from "@/lib/events";
import { isHatchetEnabled } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import {
  createPaginatedResponse,
  getPaginationParams,
} from "@/utils/pagination";

import {
  NOTIFICATION_TYPE_CONFIG,
  NOTIFICATIONS_SORT_COLUMNS,
  type NotificationType,
} from "./constants";
import { resolveEnabledChannels } from "./helpers";
import type {
  ListNotificationsQuery,
  NotificationRecord,
  PreferencesRecord,
  PushTokenRecord,
  RegisterPushTokenInput,
  SendNotificationInput,
  SendResult,
  UpdatePreferencesInput,
} from "./types";

// ============================================================
// SORT COLUMN MAPPING
// ============================================================

const SORT_COLUMNS = {
  [NOTIFICATIONS_SORT_COLUMNS.createdAt]: notifications.createdAt,
  [NOTIFICATIONS_SORT_COLUMNS.status]: notifications.status,
  [NOTIFICATIONS_SORT_COLUMNS.type]: notifications.type,
} as const;

// ============================================================
// NOTIFICATION SERVICE
// ============================================================

export const notificationService = {
  // ─────────────────────────────────────────────────────────────
  // NOTIFICATION QUERIES
  // ─────────────────────────────────────────────────────────────

  /**
   * List notifications for a user with filtering and pagination.
   */
  async listByUser(userId: string, query: ListNotificationsQuery) {
    const { perPage, offset, sort, order } = getPaginationParams(query);

    // Build conditions
    const conditions: SQL[] = [eq(notifications.userId, userId)];

    if (query.type) {
      conditions.push(eq(notifications.type, query.type));
    }

    if (query.status) {
      // Explicit status filter takes precedence over unreadOnly
      conditions.push(eq(notifications.status, query.status));
    } else if (query.unreadOnly) {
      conditions.push(eq(notifications.channel, "push"));
      conditions.push(sql`${notifications.readAt} IS NULL`);
      conditions.push(sql`${notifications.status} IN ('sent', 'delivered')`);
    }

    if (query.channel) {
      conditions.push(eq(notifications.channel, query.channel));
    }

    const where = and(...conditions);

    // Determine sort column
    const sortKey = sort as keyof typeof SORT_COLUMNS | undefined;
    const sortColumn = sortKey ? SORT_COLUMNS[sortKey] : SORT_COLUMNS.createdAt;
    const orderFn = order === "asc" ? asc : desc;

    // Get notifications
    const notificationsList = await db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(perPage)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(notifications)
      .where(where);

    return createPaginatedResponse({
      data: notificationsList,
      total: countResult?.total ?? 0,
      query,
    });
  },

  /**
   * Get a single notification by ID.
   */
  async findById(notificationId: string): Promise<NotificationRecord | null> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);
    return notification ?? null;
  },

  /**
   * Get a notification by ID for a specific user.
   */
  async findByIdAndUser(
    notificationId: string,
    userId: string
  ): Promise<NotificationRecord | null> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .limit(1);
    return notification ?? null;
  },

  /**
   * Get unread notification count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.channel, "push"),
          sql`${notifications.readAt} IS NULL`,
          sql`${notifications.status} IN ('sent', 'delivered')`
        )
      );
    return result?.count ?? 0;
  },

  /**
   * Mark a push notification as read.
   */
  async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<NotificationRecord | null> {
    const [updated] = await db
      .update(notifications)
      .set({
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
          eq(notifications.channel, "push"),
          sql`${notifications.readAt} IS NULL`
        )
      )
      .returning();
    return updated ?? null;
  },

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.channel, "push"),
          sql`${notifications.readAt} IS NULL`,
          sql`${notifications.status} IN ('sent', 'delivered')`
        )
      )
      .returning({ id: notifications.id });
    return result.length;
  },

  // ─────────────────────────────────────────────────────────────
  // SEND NOTIFICATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a notification to a user.
   * Creates notification records for each channel.
   */
  async send(input: SendNotificationInput): Promise<SendResult> {
    const typeConfig = NOTIFICATION_TYPE_CONFIG[input.type as NotificationType];
    const requestedChannels = input.channels ??
      typeConfig?.channels ?? ["push"];
    const priority = input.priority ?? typeConfig?.priority ?? "medium";

    // Check user preferences to filter channels
    const preferences = await this.getPreferences(input.userId);
    const channels = resolveEnabledChannels(
      preferences,
      input.type,
      requestedChannels
    );

    if (channels.length === 0) {
      return {
        notificationIds: [],
        channels: requestedChannels,
        sentChannels: [],
        failedChannels: [],
      };
    }

    const sentChannels: SendResult["sentChannels"] = [];
    const failedChannels: SendResult["failedChannels"] = [];
    const notificationIds: string[] = [];

    // Create notification record for each channel
    for (const channel of channels) {
      try {
        const [notification] = await db
          .insert(notifications)
          .values({
            userId: input.userId,
            type: input.type,
            channel,
            status: "pending",
            priority,
            subject: input.subject,
            body: input.body,
            props: input.props ?? null,
          })
          .returning();

        if (notification) {
          notificationIds.push(notification.id);
          sentChannels.push(channel);

          // Dispatch to Hatchet workflow for actual delivery
          if (isHatchetEnabled()) {
            const eventName =
              channel === "email"
                ? EVENTS.NOTIFICATION_EMAIL_SEND
                : EVENTS.NOTIFICATION_PUSH_SEND;

            const pushResult = await pushEvent(eventName, {
              notificationId: notification.id,
            });

            if (!pushResult.success) {
              logger.warn(
                `Failed to dispatch ${channel} delivery event for notification ${notification.id}`,
                { error: pushResult.error?.message }
              );
            }
          } else {
            logger.info(
              `Hatchet disabled, skipping ${channel} delivery for notification ${notification.id}`
            );
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        failedChannels.push({ channel, error: errorMessage });
      }
    }

    return {
      notificationIds,
      channels: requestedChannels,
      sentChannels,
      failedChannels,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // PUSH TOKENS
  // ─────────────────────────────────────────────────────────────

  /**
   * List push tokens for a user.
   */
  async listPushTokens(userId: string): Promise<PushTokenRecord[]> {
    return db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)))
      .orderBy(desc(pushTokens.createdAt));
  },

  /**
   * Register or update a push token.
   */
  async registerPushToken(
    userId: string,
    sessionId: string,
    input: RegisterPushTokenInput
  ): Promise<PushTokenRecord> {
    // Check if token already exists
    const [existing] = await db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.token, input.token))
      .limit(1);

    if (existing) {
      // Update existing token
      const [updated] = await db
        .update(pushTokens)
        .set({
          userId,
          sessionId,
          platform: input.platform,
          deviceId: input.deviceId ?? existing.deviceId,
          deviceName: input.deviceName ?? existing.deviceName,
          isActive: true,
          lastUsedAt: new Date(),
        })
        .where(eq(pushTokens.id, existing.id))
        .returning();
      return updated ?? existing;
    }

    // Create new token
    const [newToken] = await db
      .insert(pushTokens)
      .values({
        userId,
        sessionId,
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        isActive: true,
      })
      .returning();

    if (!newToken) {
      throw new Error("Failed to create push token");
    }

    return newToken;
  },

  /**
   * Deactivate a push token.
   */
  async deactivatePushToken(tokenId: string, userId: string): Promise<boolean> {
    const result = await db
      .update(pushTokens)
      .set({ isActive: false })
      .where(and(eq(pushTokens.id, tokenId), eq(pushTokens.userId, userId)))
      .returning({ id: pushTokens.id });
    return result.length > 0;
  },

  /**
   * Delete a push token by its FCM token string.
   * Used to remove tokens that Firebase reports as invalid.
   */
  async deletePushTokenByToken(token: string): Promise<boolean> {
    const result = await db
      .delete(pushTokens)
      .where(eq(pushTokens.token, token))
      .returning({ id: pushTokens.id });
    return result.length > 0;
  },

  // ─────────────────────────────────────────────────────────────
  // PREFERENCES
  // ─────────────────────────────────────────────────────────────

  /**
   * Get notification preferences for a user.
   */
  async getPreferences(userId: string): Promise<PreferencesRecord[]> {
    return db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .orderBy(asc(notificationPreferences.typePattern));
  },

  /**
   * Update notification preferences for a user.
   */
  async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    executor: Executor = db
  ): Promise<PreferencesRecord[]> {
    return executor.transaction(async (tx) => {
      // Upsert global preferences
      const globalValues = {
        userId,
        typePattern: "*",
        emailEnabled: input.emailEnabled ?? true,
        smsEnabled: input.smsEnabled ?? false,
        pushEnabled: input.pushEnabled ?? true,
      };

      await tx
        .insert(notificationPreferences)
        .values(globalValues)
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.typePattern,
          ],
          set: {
            emailEnabled: sql`EXCLUDED.email_enabled`,
            smsEnabled: sql`EXCLUDED.sms_enabled`,
            pushEnabled: sql`EXCLUDED.push_enabled`,
          },
        });

      // Upsert type-specific preferences
      if (input.typeOverrides) {
        for (const [typePattern, override] of Object.entries(
          input.typeOverrides
        )) {
          const channels = override.channels ?? [];
          const typeValues = {
            userId,
            typePattern,
            emailEnabled: channels.includes("email"),
            smsEnabled: channels.includes("sms"),
            pushEnabled: channels.includes("push"),
          };

          await tx
            .insert(notificationPreferences)
            .values(typeValues)
            .onConflictDoUpdate({
              target: [
                notificationPreferences.userId,
                notificationPreferences.typePattern,
              ],
              set: {
                emailEnabled: sql`EXCLUDED.email_enabled`,
                smsEnabled: sql`EXCLUDED.sms_enabled`,
                pushEnabled: sql`EXCLUDED.push_enabled`,
              },
            });
        }
      }

      // Read back final state inside tx for consistency
      return tx
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .orderBy(asc(notificationPreferences.typePattern));
    });
  },

  /**
   * Ensure default preferences exist for a user.
   */
  async ensureDefaultPreferences(
    userId: string,
    executor: Executor = db
  ): Promise<PreferencesRecord[]> {
    const existing = await this.getPreferences(userId);
    if (existing.length === 0) {
      return this.updatePreferences(
        userId,
        {
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: true,
        },
        executor
      );
    }
    return existing;
  },
};
