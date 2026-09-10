import { type Notification, notifications } from "@repo/db/schema";
import { NotificationEmail, sendEmail } from "@repo/email";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
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

const emailNotificationPropsSchema = z
  .object({
    actionLabel: z.string().optional(),
    actionUrl: z.string().optional(),
  })
  .passthrough();

async function resolveAndSendEmail(
  notification: Notification,
  to: string
): Promise<{ messageId?: string }> {
  const parsedProps = emailNotificationPropsSchema.safeParse(
    notification.props ?? {}
  );
  const props = parsedProps.success ? parsedProps.data : {};

  return sendEmail({
    props: {
      actionLabel: props.actionLabel,
      actionUrl: props.actionUrl,
      body: notification.body ?? "",
      subject: notification.subject ?? "Notification",
    },
    subject: notification.subject ?? "Notification",
    template: NotificationEmail,
    to,
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
    fn: async (input) => {
      const taskLogger = logger.child({
        notificationId: input.notificationId,
        workflow: "email-notification",
      });

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

      const user = await userService.findById(notification.userId);

      if (!user) {
        await db
          .update(notifications)
          .set({
            errorMessage: `User not found: ${notification.userId}`,
            status: "failed",
          })
          .where(eq(notifications.id, input.notificationId));

        throw new Error(`User not found: ${notification.userId}`);
      }

      let messageId: string | undefined;

      try {
        ({ messageId } = await resolveAndSendEmail(notification, user.email));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        await db
          .update(notifications)
          .set({
            errorMessage: errorMsg,
            status: "failed",
          })
          .where(eq(notifications.id, input.notificationId));

        taskLogger.error("Email send failed", {
          error: errorMsg,
          userId: notification.userId,
        });

        return { sent: false };
      }

      await db
        .update(notifications)
        .set({
          providerMessageId: messageId ?? null,
          sentAt: new Date(),
          status: "sent",
        })
        .where(eq(notifications.id, input.notificationId));

      taskLogger.info("Email sent successfully", {
        messageId,
        userId: notification.userId,
      });

      return { messageId, sent: true };
    },
    name: "send-email",
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createEmailNotificationWorkflow());
}
