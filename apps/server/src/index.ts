import "@/lib/tracing";
import { serve } from "@hono/node-server";
import { showRoutes } from "hono/dev";
import { env } from "@/env";
import { docs } from "@/lib/docs";
import { logger } from "@/lib/logger";
import { closeRedis, getRedis, isRedisEnabled } from "@/lib/redis";
import { app } from "@/routers/main";
import { startWorker } from "@/worker";

await docs(app, env.ENABLE_DOCS);
if (env.NODE_ENV !== "production") {
  showRoutes(app, {
    colorize: true,
  });
}

if (isRedisEnabled()) {
  // Misconfigured REDIS_URL should fail loudly at boot, not at first request.
  await getRedis();
} else if (env.NODE_ENV === "production") {
  logger.warn(
    "REDIS_URL is not set: rate-limit counters are per-process and not shared across instances"
  );
}

const shutdown = async () => {
  await closeRedis();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  async (info) => {
    logger.info(`Server is running on http://${info.address}:${info.port}`);

    await startWorker();
  }
);
