import type { Env as HonoEnv, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

/**
 * Factory: seeds the per-request envelope. MUST run before any middleware
 * that writes to `c.var.requestContext`; the chain's `requires` graph
 * enforces this. Each app injects its own default seed factory.
 */
export function buildRequestContextInitMiddleware<
  E extends HonoEnv,
  TRequestContext,
>(factory: () => TRequestContext): MiddlewareHandler<E> {
  return createMiddleware<E>(async (c, next) => {
    // boundary: Hono Env.Variables variance — package can't statically
    // prove `requestContext` is in E.Variables; consumer's Env declaration
    // makes the runtime value safe.
    (c.set as (k: "requestContext", v: TRequestContext) => void)(
      "requestContext",
      factory()
    );
    await next();
  });
}
