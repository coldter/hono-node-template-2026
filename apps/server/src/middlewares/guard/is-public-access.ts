import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";

/**
 * Required placeholder middleware for routes that can be accessed by anyone.
 */
export const isPublicAccess: MiddlewareHandler<Env> = createMiddleware<Env>(
  async (_, next): Promise<void> => {
    await next();
  }
);
