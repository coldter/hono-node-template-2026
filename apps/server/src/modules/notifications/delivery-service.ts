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
        notificationIds: [],
        channels: requestedChannels,
        sentChannels: [],
        failedChannels: [],
      };
    }

    const sentChannels: SendResult["sentChannels"] = [];
    const failedChannels: SendResult["failedChannels"] = [];
    const notificationIds: string[] = [];

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
};
