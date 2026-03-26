import type {
  BaseWorkflowDeclaration,
  Worker,
} from "@hatchet-dev/typescript-sdk/v1";
import { env } from "@/env";
import { getHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";

let worker: Worker | null = null;
// biome-ignore lint/suspicious/noExplicitAny: SDK requires flexible workflow types
const workflowsToRegister: BaseWorkflowDeclaration<any, any>[] = [];

export function registerWorkflow(
  // biome-ignore lint/suspicious/noExplicitAny: SDK requires flexible workflow types
  workflow: BaseWorkflowDeclaration<any, any>
): void {
  workflowsToRegister.push(workflow);
}

export async function createWorker(): Promise<Worker | null> {
  if (!env.HATCHET_ENABLED) {
    logger.info("Hatchet disabled, worker not started");
    return null;
  }

  if (worker) {
    return worker;
  }

  const hatchet = getHatchet();
  if (!hatchet) {
    return null;
  }

  if (workflowsToRegister.length === 0) {
    logger.warn("No workflows registered, worker not started");
    return null;
  }

  worker = await hatchet.worker("main-worker", {
    workflows: workflowsToRegister,
    slots: env.HATCHET_WORKER_SLOTS,
  });

  return worker;
}

export async function startWorker(): Promise<void> {
  if (!env.HATCHET_ENABLED) {
    return;
  }

  await import("@/modules/users/workflow");
  await import("@/modules/notifications/workflows/email-notification.workflow");
  await import("@/modules/notifications/workflows/push-notification.workflow");

  const workerInstance = await createWorker();

  if (!workerInstance) {
    return;
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down worker gracefully...`);
    try {
      await workerInstance.stop();
      logger.info("Worker stopped successfully");
    } catch (error) {
      logger.error("Error stopping worker", { error });
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("Starting Hatchet worker...", {
    slots: env.HATCHET_WORKER_SLOTS,
    workflows: workflowsToRegister.length,
  });

  await workerInstance.start();
}
