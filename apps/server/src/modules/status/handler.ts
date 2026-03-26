import { OpenAPIHono } from "@hono/zod-openapi";

import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";

import statusRoutes from "./routes";

const app = new OpenAPIHono<Env>({ defaultHook });

const statusHandler = app.openapi(statusRoutes.getStatus, (c) => {
  return c.json({ status: "ok" as const }, 200);
});

export default statusHandler;
