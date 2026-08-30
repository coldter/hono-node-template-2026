import { OpenAPIHono } from "@hono/zod-openapi";

import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";

import statusRoutes from "./routes";
import { checkReadiness } from "./service";

const app = new OpenAPIHono<Env>({ defaultHook });

const statusHandler = app
  .openapi(statusRoutes.getStatus, (c) =>
    c.json({ status: "ok" as const }, 200)
  )
  .openapi(statusRoutes.getReadiness, async (c) => {
    const checks = await checkReadiness();
    const ready = checks.database && checks.redis !== false;
    if (!ready) {
      return c.json({ checks, status: "unavailable" as const }, 503);
    }
    return c.json({ checks, status: "ok" as const }, 200);
  });

export default statusHandler;
