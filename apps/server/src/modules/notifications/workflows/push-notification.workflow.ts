import { notifications, pushTokens } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { EVENTS, type EventPayloads } from "@/lib/events";
import { getPushProvider } from "@/lib/firebase";
import { isHatchetEnabled, requireHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { notificationService } from "@/modules/notifications/service";
import { registerWorkflow } from "@/worker";

type PushNotificationInput =
  EventPayloads[typeof EVENTS.NOTIFICATION_PUSH_SEND];

type PushNotificationOutput = {
  sendPush: { sent: boolean; deliveredCount: number; failedCount: number };
};

function createPushNotificationWorkflow() {
  const hatchet = requireHatchet();

  const workflow = hatchet.workflow<
    PushNotificationInput,
    PushNotificationOutput
  >({
    name: "push-notification",
    onEvents: [EVENTS.NOTIFICATION_PUSH_SEND],
  });

  workflow.task({
    fn: async (input) => {
      const taskLogger = logger.child({
        notificationId: input.notificationId,
        workflow: "push-notification",
      });

      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .limit(1);

      if (!notification) {
        throw new Error(`Notification not found: ${input.notificationId}`);
      }

      if (notification.channel !== "push") {
        throw new Error(
          `Notification ${input.notificationId} channel is "${notification.channel}", expected "push"`
        );
      }

      if (notification.status !== "pending") {
        taskLogger.warn("Notification is not in pending status, skipping", {
          status: notification.status,
        });
        return { deliveredCount: 0, failedCount: 0, sent: false };
      }

      const tokens = await db
        .select()
        .from(pushTokens)
        .where(
          and(
            eq(pushTokens.userId, notification.userId),
            eq(pushTokens.isActive, true)
          )
        );

      if (tokens.length === 0) {
        taskLogger.warn("No active push tokens for user", {
          userId: notification.userId,
        });

        await db
          .update(notifications)
          .set({
            errorMessage: "No active push tokens",
            status: "failed",
          })
          .where(eq(notifications.id, input.notificationId));

        return { deliveredCount: 0, failedCount: 0, sent: false };
      }

      const provider = getPushProvider();
      let deliveredCount = 0;
      let failedCount = 0;

      const sendResults = await Promise.all(
        tokens.map(async (pushToken) => {
          try {
            const result = await provider.send({
              data: {
                body: notification.body ?? "",
                deepLink: `notification/${notification.id}`,
                notificationId: notification.id,
                priority: notification.priority,
                title: notification.subject ?? "",
                type: notification.type,
              },
              token: pushToken.token,
            });
            return { error: undefined, pushToken, result } as const;
          } catch (err) {
            return { error: err, pushToken, result: undefined } as const;
          }
        })
      );

      const invalidTokens: Array<{ id: string; token: string }> = [];
      for (const settled of sendResults) {
        const { pushToken, result, error } = settled;
        if (error !== undefined || result === undefined) {
          failedCount += 1;
          taskLogger.warn("Push failed for device", {
            error,
            tokenId: pushToken.id,
          });
          continue;
        }

        if (result.success) {
          deliveredCount += 1;
          taskLogger.info("Push sent to device", {
            messageId: result.messageId,
            tokenId: pushToken.id,
          });
        } else {
          failedCount += 1;
          taskLogger.warn("Push failed for device", {
            error: result.error,
            invalidToken: result.invalidToken,
            tokenId: pushToken.id,
          });

          if (result.invalidToken) {
            invalidTokens.push({ id: pushToken.id, token: pushToken.token });
          }
        }
      }

      if (invalidTokens.length > 0) {
        await Promise.all(
          invalidTokens.map(({ token }) =>
            notificationService.deletePushTokenByToken(token)
          )
        );
        for (const { id } of invalidTokens) {
          taskLogger.info("Removed invalid push token", { tokenId: id });
        }
      }

      const allFailed = deliveredCount === 0;
      await db
        .update(notifications)
        .set({
          errorMessage: allFailed
            ? `All ${failedCount} push tokens failed`
            : null,
          sentAt: allFailed ? undefined : new Date(),
          status: allFailed ? "failed" : "sent",
        })
        .where(eq(notifications.id, input.notificationId));

      taskLogger.info("Push notification workflow complete", {
        deliveredCount,
        failedCount,
        userId: notification.userId,
      });

      return { deliveredCount, failedCount, sent: deliveredCount > 0 };
    },
    name: "send-push",
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createPushNotificationWorkflow());
}
