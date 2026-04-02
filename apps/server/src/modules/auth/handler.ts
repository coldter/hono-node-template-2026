import { OpenAPIHono } from "@hono/zod-openapi";

import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";
import { auth } from "./instance";

const authRouteHandler = new OpenAPIHono<Env>({ defaultHook });

authRouteHandler.on(["POST", "GET"], "/*", (c) => auth.handler(c.req.raw));

export default authRouteHandler;
