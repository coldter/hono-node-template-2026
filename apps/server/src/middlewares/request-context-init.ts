import { buildRequestContextInitMiddleware } from "@repo/hono-app";

import { createEmptyRequestContext, type Env } from "@/lib/context";

export const requestContextInitMiddleware = buildRequestContextInitMiddleware<
  Env,
  ReturnType<typeof createEmptyRequestContext>
>(createEmptyRequestContext);
