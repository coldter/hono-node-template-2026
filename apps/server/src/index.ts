import "@/lib/tracing";
import { serve } from "@hono/node-server";
import { createTenantInvalidationSubscriber } from "@repo/tenancy";
import { showRoutes } from "hono/dev";
import { env } from "@/env";
import { docs } from "@/lib/docs";
import { getHatchet } from "@/lib/hatchet";
import { logger } from "@/lib/logger";
import { app } from "@/routers/main";
import { tenancyCache } from "@/server";
import { registerWorkflow, startWorker } from "@/worker";

await docs(app, env.ENABLE_DOCS);
showRoutes(app, {
  colorize: true,
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  async (info) => {
    logger.info(`Server is running on http://${info.address}:${info.port}`);

    // When Hatchet is disabled the cache self-heals via TTL expiry; the
    // subscriber only matters for cross-process fan-out invalidation.
    const hatchet = getHatchet();
    if (hatchet !== null && env.HATCHET_ENABLED) {
      createTenantInvalidationSubscriber({
        hatchet: {
          workflow(cfg) {
            // boundary: Hatchet SDK WorkflowDeclaration generic variance — the SDK's
            // workflow().task() fn signature includes a ctx arg our minimal bus does not.
            // The returned WorkflowDeclaration is registered with the Hatchet worker below.
            const wf = hatchet.workflow(cfg);
            registerWorkflow(wf);
            return {
              task(taskCfg) {
                // boundary: vendor-SDK generic variance — single-arg fn is valid JS/TS at
                // runtime; the extra ctx arg is simply ignored by our handler.
                wf.task(taskCfg as unknown as Parameters<typeof wf.task>[0]);
              },
            };
          },
        },
        cache: tenancyCache,
        logger,
      });
    }

    await startWorker();
  }
);
