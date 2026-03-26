import { OpenAPIHono } from "@hono/zod-openapi";

import type { Env } from "@/lib/context";
import rolesHandler from "@/modules/auth/roles/handler";
import { defaultHook } from "@/utils/default-hook";
import { auth } from "./instance";

const authRouteHandler = new OpenAPIHono<Env>({ defaultHook });

authRouteHandler.route("/roles", rolesHandler);
authRouteHandler.on(["POST", "GET"], "/*", (c) => auth.handler(c.req.raw));

export default authRouteHandler;
