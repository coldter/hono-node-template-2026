import type { TenancyCache } from "./cache";

export type HatchetWorkflowBus = Readonly<{
  workflow(cfg: { name: string; on: { event: string } }): {
    task(taskCfg: {
      name: string;
      fn: (input: { host?: string }) => Promise<unknown>;
    }): void;
  };
}>;

export type CreateTenantInvalidationSubscriberOptions = Readonly<{
  hatchet: HatchetWorkflowBus;
  cache: TenancyCache;
  logger?: { info(o: Record<string, unknown>): void };
}>;

const WORKFLOW_NAME = "tenancy.invalidate";
const EVENT_KEY = "tenancy.invalidate";
const TASK_NAME = "drop-local-cache";

export function createTenantInvalidationSubscriber(
  deps: CreateTenantInvalidationSubscriberOptions
): void {
  const wf = deps.hatchet.workflow({
    name: WORKFLOW_NAME,
    on: { event: EVENT_KEY },
  });
  wf.task({
    name: TASK_NAME,
    fn: async (input: { host?: string }) => {
      deps.cache.clearLocal();
      deps.logger?.info({
        event: "tenancy.invalidate.received",
        host: input.host ?? "(all)",
      });
      return { ok: true };
    },
  });
}
