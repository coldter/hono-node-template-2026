/**
 * Hatchet workflow: reconcile-hostnames.
 *
 * Thin shell around `./lib/reconcile-hostnames.ts`. Business logic lives
 * there so it can be unit-tested without booting Hatchet; this file wires
 * the cron schedule (`* * * * *`) and the production dependency graph.
 * `scan` debounces rows updated within the last 50 seconds.
 */

import { createFanOutInvalidator } from "@repo/tenancy";
import { db } from "@/db";
import { env } from "@/env";
import { isHatchetEnabled, requireHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { tenancyCache } from "@/server";
import { registerWorkflow } from "@/worker";
import { defaultReconcilerDeps, scan } from "./lib/reconcile-hostnames";

type ScanOutput = { scanned: true };

type ReconcileHostnamesOutput = {
  scan: ScanOutput;
};

function createReconcileHostnamesWorkflow() {
  const hatchet = requireHatchet();

  const workflow = hatchet.workflow<
    Record<string, never>,
    ReconcileHostnamesOutput
  >({
    name: "reconcile-hostnames",
    on: { cron: "* * * * *" },
  });

  workflow.task({
    name: "scan",
    fn: async (): Promise<ScanOutput> => {
      const taskLogger = logger.child({
        workflow: "reconcile-hostnames",
      });

      try {
        const invalidator = createFanOutInvalidator({
          hatchet: {
            events: {
              push: (key, payload) => hatchet.events.push(key, payload),
            },
          },
          cache: tenancyCache,
          logger: taskLogger,
        });

        const deps = defaultReconcilerDeps({
          db,
          invalidator,
          txtLabel: env.CUSTOM_HOST_VERIFICATION_LABEL,
        });

        await scan(deps);
        return { scanned: true };
      } catch (error) {
        taskLogger.error("reconcile-hostnames scan failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  });

  return workflow;
}

if (isHatchetEnabled()) {
  registerWorkflow(createReconcileHostnamesWorkflow());
}
