import { notifications } from "@repo/db/schema";
import { db } from "@/db";
import { EVENTS, pushEvent } from "@/lib/events";
import { isHatchetEnabled } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { NOTIFICATION_TYPE_CONFIG, type NotificationType } from "./constants";
import { resolveEnabledChannels } from "./helpers";
import { notificationPreferencesService } from "./preferences-service";
import type { SendNotificationInput, SendResult } from "./types";

export const notificationDeliveryService = {
  async send(input: SendNotificationInput): Promise<SendResult> {
    const typeConfig = NOTIFICATION_TYPE_CONFIG[input.type as NotificationType];
    const requestedChannels = input.channels ??
      typeConfig?.channels ?? ["push"];
    const priority = input.priority ?? typeConfig?.priority ?? "medium";

    const preferences = await notificationPreferencesService.getPreferences(
      input.userId
    );
    const channels = resolveEnabledChannels(
      preferences,
      input.type,
      requestedChannels
    );

    if (channels.length === 0) {
      return {
        channels: requestedChannels,
        failedChannels: [],
        notificationIds: [],
        sentChannels: [],
      };
    }

    const sentChannels: SendResult["sentChannels"] = [];
    const failedChannels: SendResult["failedChannels"] = [];
    const notificationIds: string[] = [];

    const perChannel = await Promise.all(
      channels.map(
        async (
          channel
        ): Promise<{
          channel: (typeof channels)[number];
          error?: string;
          notificationId?: string;
        }> => {
          try {
            const [notification] = await db
              .insert(notifications)
              .values({
                body: input.body,
                channel,
                priority,
                props: input.props ?? null,
                status: "pending",
                subject: input.subject,
                type: input.type,
                userId: input.userId,
              })
              .returning();

            if (!notification) {
              return { channel };
            }

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
            return { channel, notificationId: notification.id };
          } catch (error) {
            return {
              channel,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        }
      )
    );

    for (const result of perChannel) {
      if (result.error) {
        failedChannels.push({ channel: result.channel, error: result.error });
      } else if (result.notificationId) {
        notificationIds.push(result.notificationId);
        sentChannels.push(result.channel);
      } else {
        failedChannels.push({
          channel: result.channel,
          error: "Insert returned no row",
        });
      }
    }

    return {
      channels: requestedChannels,
      failedChannels,
      notificationIds,
      sentChannels,
    };
  },
};
