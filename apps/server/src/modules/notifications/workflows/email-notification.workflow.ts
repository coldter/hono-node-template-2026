import { NotificationEmail, sendEmail } from "@repo/email";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type Notification, notifications } from "@/db/schema";
import { EVENTS, type EventPayloads } from "@/lib/events";
import { isHatchetEnabled, requireHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { userService } from "@/modules/users/service";
import { registerWorkflow } from "@/worker";

type EmailNotificationInput =
  EventPayloads[typeof EVENTS.NOTIFICATION_EMAIL_SEND];

type EmailNotificationOutput = {
  sendEmail: { sent: boolean; messageId?: string };
};

async function resolveAndSendEmail(notification: Notification, to: string) {
  const props = notification.props;

  return sendEmail({
    to,
    subject: notification.subject ?? "Notification",
    template: NotificationEmail,
    props: {
      subject: notification.subject ?? "Notification",
      body: notification.body ?? "",
      actionUrl: (props?.actionUrl as string) ?? undefined,
      actionLabel: (props?.actionLabel as string) ?? undefined,
    },
  });
}

function createEmailNotificationWorkflow() {
  const hatchet = requireHatchet();

  const workflow = hatchet.workflow<
    EmailNotificationInput,
    EmailNotificationOutput
  >({
    name: "email-notification",
    onEvents: [EVENTS.NOTIFICATION_EMAIL_SEND],
  });

  workflow.task({
    name: "send-email",
    fn: async (input) => {
      const taskLogger = logger.child({
        workflow: "email-notification",
        notificationId: input.notificationId,
      });

      // Load notification record
      const [notification] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, input.notificationId))
        .limit(1);

      if (!notification) {
        throw new Error(`Notification not found: ${input.notificationId}`);
      }

      if (notification.channel !== "email") {
        throw new Error(
          `Notification ${input.notificationId} channel is "${notification.channel}", expected "email"`
        );
      }

      // Look up user email
      const user = await userService.findById(notification.userId);

      if (!user) {
        await db
          .update(notifications)
          .set({
            status: "failed",
            errorMessage: `User not found: ${notification.userId}`,
          })
          .where(eq(notifications.id, input.notificationId));

        throw new Error(`User not found: ${notification.userId}`);
      }

      try {
        const result = await resolveAndSendEmail(notification, user.email);

        if (!result.success) {
          const errorMsg = result.error?.message ?? "Email delivery failed";

          await db
            .update(notifications)
            .set({
              status: "failed",
              errorMessage: errorMsg,
            })
            .where(eq(notifications.id, input.notificationId));

          taskLogger.error("Email send failed", {
            error: errorMsg,
            userId: notification.userId,
          });

          return { sent: false };
        }

        // Success: update DB record
        await db
          .update(notifications)
          .set({
            status: "sent",
            sentAt: new Date(),
            providerMessageId: result.messageId ?? null,
          })
          .where(eq(notifications.id, input.notificationId));

        taskLogger.info("Email sent successfully", {
          messageId: result.messageId,
          userId: notification.userId,
        });

        return { sent: true, messageId: result.messageId };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        await db
          .update(notifications)
          .set({
            status: "failed",
            errorMessage: errorMsg,
          })
          .where(eq(notifications.id, input.notificationId));

        taskLogger.error("Email send threw an error", {
          error: errorMsg,
          userId: notification.userId,
        });

        throw error;
      }
    },
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createEmailNotificationWorkflow());
}
