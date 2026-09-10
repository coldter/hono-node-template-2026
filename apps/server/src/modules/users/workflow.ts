import { sendEmail, WelcomeEmail } from "@repo/email";
import { env } from "@/env";
import { EVENTS, type EventPayloads } from "@/lib/events";
import { isHatchetEnabled, requireHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { registerWorkflow } from "@/worker";

type UserCreatedInput = EventPayloads[typeof EVENTS.USER_CREATED];

type UserOnboardingOutput = {
  logUserCreation: { logged: boolean };
  sendWelcomeEmail: { sent: boolean };
};

function createUserOnboardingWorkflow() {
  const hatchet = requireHatchet();

  const workflow = hatchet.workflow<UserCreatedInput, UserOnboardingOutput>({
    name: "user-onboarding",
    onEvents: [EVENTS.USER_CREATED],
  });

  workflow.task({
    fn: async (input) => {
      const taskLogger = logger.child({
        userId: input.userId,
        workflow: "user-onboarding",
      });

      taskLogger.info("User onboarding started", {
        email: input.email,
        name: input.name,
      });

      taskLogger.info("User onboarding completed");

      return { logged: true };
    },
    name: "log-user-creation",
  });

  workflow.task({
    fn: async (input) => {
      const taskLogger = logger.child({
        userId: input.userId,
        workflow: "user-onboarding",
      });

      try {
        const loginUrl = `${env.BETTER_AUTH_URL}/login`;

        const result = await sendEmail({
          props: {
            loginUrl,
            userName: input.name,
          },
          subject: "Welcome to the platform!",
          template: WelcomeEmail,
          to: input.email,
        });

        taskLogger.info("Welcome email sent successfully", {
          email: input.email,
          messageId: result.messageId,
        });

        return { sent: true };
      } catch (error) {
        taskLogger.error("Failed to send welcome email", {
          email: input.email,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    name: "send-welcome-email",
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createUserOnboardingWorkflow());
}
