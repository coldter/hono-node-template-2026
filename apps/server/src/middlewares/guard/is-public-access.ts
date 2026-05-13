import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";

/** Placeholder guard for routes that are publicly accessible. */
export const isPublicAccess: MiddlewareHandler<Env> = createMiddleware<Env>(
  async (_, next): Promise<void> => {
    await next();
  }
);
