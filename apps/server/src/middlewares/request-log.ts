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

// Docker healthchecks poll these every 30s; logging them is pure noise and
// rate-limiting them would make readiness flap (see middlewares/rate-limit.ts).
const HEALTH_CHECK_PATHS = new Set([
  `${BASE_PATH}/api/status`,
  `${BASE_PATH}/api/status/ready`,
]);

export function isHealthCheckPath(path: string): boolean {
  return HEALTH_CHECK_PATHS.has(path);
}

export function getClientAddressInfo(c: Context<Env>): {
  forwardedFor: string | undefined;
  remoteAddress: string | undefined;
} {
  let remoteAddress: string | undefined;
  try {
    remoteAddress = getConnInfo(c).remote.address ?? undefined;
  } catch {
    // getConnInfo throws outside the node-server runtime (tests, workers).
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
  // Errors thrown downstream are converted to responses by Hono's onError at
  // the throwing frame, so next() resolves and c.res reflects the error status.
  await next();

  const status = c.res.status;
  const durationMs = performance.now() - startedAt;

  recordHttpRequestDuration({
    method: c.req.method,
    route: c.req.routePath,
    statusCode: status,
    durationMs,
  });

  // Health probes stay in the histogram (pre-aggregated, one low-cardinality
  // series, probe latency is a real signal) but not in logs, where a line
  // every 30s per orchestrator is pure noise.
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
    method: c.req.method,
    path: c.req.path,
    route: c.req.routePath,
    status,
    duration_ms: Number(durationMs.toFixed(1)),
    request_id: c.get("requestId") ?? null,
    trace_id: getTraceIdFromContext(c),
    client_ip: resolveClientIp(c),
  });
});
