import "@/lib/tracing";
import { serve } from "@hono/node-server";
import { showRoutes } from "hono/dev";
import { env } from "@/env";
import { docs } from "@/lib/docs";
import { logger } from "@/lib/logger";
import { app } from "@/routers/main";
import { startWorker } from "@/worker";

await docs(app, env.ENABLE_DOCS);
showRoutes(app, {
  colorize: true,
  // verbose: true,
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    // hostname: process.env.HOSTNAME || "localhost",
  },
  async (info) => {
    logger.info(`Server is running on http://${info.address}:${info.port}`);

    /**
     * Start background worker processes
     */
    await startWorker();
  }
);
