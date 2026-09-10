import "@/lib/tracing";
import { serve } from "@hono/node-server";
import { showRoutes } from "hono/dev";
import { closeDb } from "@/db";
import { env } from "@/env";
import { docs } from "@/lib/docs";
import { logger } from "@/lib/logger";
import { shutdownOpenTelemetry } from "@/lib/otel-sdk";
import { closeRedis, getRedis, isRedisEnabled } from "@/lib/redis";
import { app } from "@/routers/main";
import { startWorker, stopWorker } from "@/worker";

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const meta =
    reason instanceof Error
      ? { message: reason.message, stack: reason.stack }
      : { message: String(reason) };
  logger.error("Unhandled promise rejection", meta);
  process.exit(1);
});

await docs(app, env.ENABLE_DOCS);
if (env.NODE_ENV !== "production") {
  showRoutes(app, {
    colorize: true,
  });
}

if (isRedisEnabled()) {
  await getRedis();
} else if (env.NODE_ENV === "production") {
  logger.warn(
    "REDIS_URL is not set: rate-limit counters are per-process and not shared across instances"
  );
}

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  async (info) => {
    logger.info(`Server is running on http://${info.address}:${info.port}`);

    await startWorker();
  }
);

const FORCE_EXIT_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function runShutdownPhase(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    logger.info(`Shutdown: ${name} complete`);
  } catch (error) {
    logger.error(`Shutdown: ${name} failed`, { error });
  }
}

function closeHttpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));

    if ("closeIdleConnections" in server) {
      server.closeIdleConnections();
    }
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    logger.error(
      `Shutdown did not complete within ${FORCE_EXIT_TIMEOUT_MS}ms, forcing exit`
    );
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimer.unref();

  await runShutdownPhase("http server", closeHttpServer);
  await runShutdownPhase("hatchet worker", stopWorker);
  await runShutdownPhase("redis", closeRedis);
  await runShutdownPhase("pg pool", closeDb);

  await runShutdownPhase("opentelemetry", shutdownOpenTelemetry);

  process.exit(0);
}

function onShutdownSignal(signal: string): void {
  shutdown(signal).catch((cause: unknown) => {
    logger.error("Shutdown failed", { error: cause });
    process.exit(1);
  });
}

process.on("SIGINT", () => onShutdownSignal("SIGINT"));
process.on("SIGTERM", () => onShutdownSignal("SIGTERM"));
