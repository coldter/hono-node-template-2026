import type { Context, Env as HonoEnv, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuditContext } from "../context";

export function extractAuditContext(c: Context): AuditContext {
  return {
    ipAddress:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  };
}

/**
 * Factory: writes `requestContext.audit`. The extractor is injected so an
 * app can override default HTTP-only extraction (e.g. include tenant fields).
 */
export function buildAuditContextMiddleware<E extends HonoEnv>(
  extract: (c: Context) => AuditContext
): MiddlewareHandler<E> {
  return createMiddleware<E>(async (c, next) => {
    // boundary: Hono Env.Variables variance — the package can't statically
    // prove `requestContext` lives on E; consumer's Env declaration does.
    const get = c.get as (k: "requestContext") => { audit: AuditContext };
    const set = c.set as (
      k: "requestContext",
      v: { audit: AuditContext }
    ) => void;
    const current = get("requestContext");
    set("requestContext", { ...current, audit: extract(c) });
    await next();
  });
}
