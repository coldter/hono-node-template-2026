import type {
  BaseWorkflowDeclaration,
  Worker,
} from "@hatchet-dev/typescript-sdk/v1";
import type {
  InputType,
  OutputType,
} from "@hatchet-dev/typescript-sdk/v1/types";
import { env } from "@/env";
import { getHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";

type AnyWorkflowDeclaration = BaseWorkflowDeclaration<InputType, OutputType>;

let worker: Worker | null = null;
const workflowsToRegister: AnyWorkflowDeclaration[] = [];

export function registerWorkflow(workflow: AnyWorkflowDeclaration): void {
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
    slots: env.HATCHET_WORKER_SLOTS,
    workflows: workflowsToRegister,
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

  logger.info("Starting Hatchet worker...", {
    slots: env.HATCHET_WORKER_SLOTS,
    workflows: workflowsToRegister.length,
  });

  await workerInstance.start();
}

export async function stopWorker(): Promise<void> {
  if (!worker) {
    return;
  }
  const workerInstance = worker;
  worker = null;
  await workerInstance.stop();
}
