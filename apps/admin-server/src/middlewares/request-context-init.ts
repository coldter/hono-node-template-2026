import { buildRequestContextInitMiddleware } from "@repo/hono-app";
import { createEmptyRequestContext, type Env } from "@/lib/context";

/**
 * Seeds the per-request envelope for admin-server. Must run before any
 * middleware that writes to `c.var.requestContext`; the chain's `requires`
 * graph enforces this.
 */
export const requestContextInitMiddleware = buildRequestContextInitMiddleware<
  Env,
  ReturnType<typeof createEmptyRequestContext>
>(createEmptyRequestContext);
