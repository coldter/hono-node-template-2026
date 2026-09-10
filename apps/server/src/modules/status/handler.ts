import { OpenAPIHono } from "@hono/zod-openapi";

import { db, isDbSkipped } from "@/db";
import type { Env } from "@/lib/context";
import { getRedis, isRedisEnabled } from "@/lib/redis";
import { defaultHook } from "@/utils/default-hook";

import statusRoutes from "./routes";
import { checkReadiness, type ReadinessChecks } from "./service";

export type ReadinessCheck = () => Promise<ReadinessChecks>;

export function createStatusHandler(check: ReadinessCheck) {
  const app = new OpenAPIHono<Env>({ defaultHook });

  return app
    .openapi(statusRoutes.getStatus, (c) =>
      c.json({ status: "ok" as const }, 200)
    )
    .openapi(statusRoutes.getReadiness, async (c) => {
      const checks = await check();
      const ready = checks.database && checks.redis !== false;
      if (!ready) {
        return c.json({ checks, status: "unavailable" as const }, 503);
      }
      return c.json({ checks, status: "ok" as const }, 200);
    });
}

const statusHandler = createStatusHandler(() =>
  checkReadiness({
    database: isDbSkipped ? null : db,
    redis: { getClient: getRedis, isEnabled: isRedisEnabled },
  })
);

export default statusHandler;
