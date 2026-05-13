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
    name: "send-push",
    fn: async (input) => {
      const taskLogger = logger.child({
        workflow: "push-notification",
        notificationId: input.notificationId,
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
        return { sent: false, deliveredCount: 0, failedCount: 0 };
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
            status: "failed",
            errorMessage: "No active push tokens",
          })
          .where(eq(notifications.id, input.notificationId));

        return { sent: false, deliveredCount: 0, failedCount: 0 };
      }

      const provider = getPushProvider();
      let deliveredCount = 0;
      let failedCount = 0;

      for (const pushToken of tokens) {
        const result = await provider.send({
          token: pushToken.token,
          data: {
            notificationId: notification.id,
            type: notification.type,
            title: notification.subject ?? "",
            body: notification.body ?? "",
            priority: notification.priority,
            deepLink: `notification/${notification.id}`,
          },
        });

        if (result.success) {
          deliveredCount++;
          taskLogger.info("Push sent to device", {
            tokenId: pushToken.id,
            messageId: result.messageId,
          });
        } else {
          failedCount++;
          taskLogger.warn("Push failed for device", {
            tokenId: pushToken.id,
            error: result.error,
            invalidToken: result.invalidToken,
          });

          if (result.invalidToken) {
            await notificationService.deletePushTokenByToken(pushToken.token);
            taskLogger.info("Removed invalid push token", {
              tokenId: pushToken.id,
            });
          }
        }
      }

      const allFailed = deliveredCount === 0;
      await db
        .update(notifications)
        .set({
          status: allFailed ? "failed" : "sent",
          sentAt: allFailed ? undefined : new Date(),
          errorMessage: allFailed
            ? `All ${failedCount} push tokens failed`
            : null,
        })
        .where(eq(notifications.id, input.notificationId));

      taskLogger.info("Push notification workflow complete", {
        deliveredCount,
        failedCount,
        userId: notification.userId,
      });

      return { sent: deliveredCount > 0, deliveredCount, failedCount };
    },
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createPushNotificationWorkflow());
}
