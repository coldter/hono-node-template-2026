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
    name: "log-user-creation",
    fn: async (input) => {
      const taskLogger = logger.child({
        workflow: "user-onboarding",
        userId: input.userId,
      });

      taskLogger.info("User onboarding started", {
        email: input.email,
        name: input.name,
      });

      taskLogger.info("User onboarding completed");

      return { logged: true };
    },
  });

  workflow.task({
    name: "send-welcome-email",
    fn: async (input) => {
      const taskLogger = logger.child({
        workflow: "user-onboarding",
        userId: input.userId,
      });

      try {
        const loginUrl = `${env.BETTER_AUTH_URL}/login`;

        await sendEmail({
          to: input.email,
          subject: "Welcome to the platform!",
          template: WelcomeEmail,
          props: {
            userName: input.name,
            loginUrl,
          },
        });

        taskLogger.info("Welcome email sent successfully", {
          email: input.email,
        });

        return { sent: true };
      } catch (error) {
        taskLogger.error("Failed to send welcome email", {
          error: error instanceof Error ? error.message : String(error),
          email: input.email,
        });
        throw error;
      }
    },
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createUserOnboardingWorkflow());
}
