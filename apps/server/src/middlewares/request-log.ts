import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { env } from "@/env";
import { resolveRateLimitKey } from "@/lib/client-ip";
import type { Env } from "@/lib/context";
import { logger } from "@/lib/logger";
import { recordHttpRequestDuration } from "@/lib/metrics";
import { getTraceIdFromContext } from "@/lib/otel-utils";

const BASE_PATH = env.BASE_PATH || "";

const HEALTH_CHECK_PATHS = new Set([
  `${BASE_PATH}/api/status`,
  `${BASE_PATH}/api/status/ready`,
]);

export function isHealthCheckPath(path: string): boolean {
  return HEALTH_CHECK_PATHS.has(path);
}

export interface ClientAddressInfo {
  forwardedFor: string | undefined;
  remoteAddress: string | undefined;
}

export function getClientAddressInfo(c: Context<Env>): ClientAddressInfo {
  let remoteAddress: string | undefined;
  try {
    remoteAddress = getConnInfo(c).remote.address ?? undefined;
  } catch {
    remoteAddress = undefined;
  }
  return { forwardedFor: c.req.header("x-forwarded-for"), remoteAddress };
}

export function resolveClientIp(c: Context<Env>): string | null {
  const { forwardedFor, remoteAddress } = getClientAddressInfo(c);
  return resolveRateLimitKey({
    forwardedFor,
    remoteAddress,
    trustProxy: env.TRUST_PROXY,
  });
}

const httpLogger = logger.child({ label: "Http-Request" });

export const requestLogMiddleware = createMiddleware<Env>(async (c, next) => {
  const startedAt = performance.now();

  await next();

  const { status } = c.res;
  const durationMs = performance.now() - startedAt;

  recordHttpRequestDuration({
    durationMs,
    method: c.req.method,
    route: c.req.routePath,
    statusCode: status,
  });

  if (isHealthCheckPath(c.req.path)) {
    return;
  }

  let level = "info";
  if (status >= 500) {
    level = "error";
  } else if (status >= 400) {
    level = "warn";
  }
  httpLogger.log(level, "request completed", {
    client_ip: resolveClientIp(c),
    duration_ms: Number(durationMs.toFixed(1)),
    method: c.req.method,
    path: c.req.path,
    request_id: c.get("requestId") ?? null,
    route: c.req.routePath,
    status,
    trace_id: getTraceIdFromContext(c),
  });
});
