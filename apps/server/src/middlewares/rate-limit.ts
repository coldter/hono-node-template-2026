import { HTTPException } from "hono/http-exception";
import type { Store } from "hono-rate-limiter";
import { rateLimiter } from "hono-rate-limiter";
import { ms } from "itty-time";
import type { RedisReply } from "rate-limit-redis";
import { RedisStore } from "rate-limit-redis";
import { env } from "@/env";
import { resolveRateLimitKey } from "@/lib/client-ip";
import type { Env } from "@/lib/context";
import { logger } from "@/lib/logger";
import { recordRateLimitRejection } from "@/lib/metrics";
import { getRedis, isRedisEnabled } from "@/lib/redis";
import {
  getClientAddressInfo,
  isHealthCheckPath,
  resolveClientIp,
} from "@/middlewares/request-log";

// Sample 429 logs with a plain counter (first rejection, then 1-in-N): an
// attack can produce thousands of 429s per second, and per-key dedup would
// need an evicting map whose memory scales with attacker IP diversity.
const REJECTION_LOG_SAMPLE_RATE = 50;
let rejectionCount = 0;

export const globalRateLimitMW = rateLimiter<Env>({
  limit: 1000,
  windowMs: ms("1 minutes"),
  ...(isRedisEnabled()
    ? {
        store: new RedisStore({
          prefix: "global-rl:",
          sendCommand: async (...args: string[]) => {
            const client = await getRedis();
            // boundary: node-redis v6 sendCommand is generic over the reply
            // type; rate-limit-redis RedisReply is structurally what raw
            // string commands return.
            return client.sendCommand<RedisReply>(args);
          },
          // boundary: rate-limit-redis implements the express-rate-limit Store
          // contract hono-rate-limiter consumes; only the init() options
          // parameter types differ, and init only reads windowMs, which
          // hono-rate-limiter's config provides.
        }) as unknown as Store<Env>,
      }
    : {}),
  handler: (c) => {
    recordRateLimitRejection("limit_exceeded");
    rejectionCount += 1;
    if (rejectionCount % REJECTION_LOG_SAMPLE_RATE === 1) {
      logger.warn("rate limit exceeded", {
        key: resolveClientIp(c),
        method: c.req.method,
        path: c.req.path,
        rejectionCount,
      });
    }
    throw new HTTPException(429, {
      message: "Too many requests, please try again later.",
    });
  },
  keyGenerator: (c) => {
    const { forwardedFor, remoteAddress } = getClientAddressInfo(c);
    const key = resolveRateLimitKey({
      forwardedFor,
      remoteAddress,
      trustProxy: env.TRUST_PROXY,
    });

    // Fail closed: a request with no resolvable client IP must not land in a
    // shared anonymous bucket.
    if (key) {
      return key;
    }
    // This branch firing in production almost always means TRUST_PROXY does
    // not match the deployment's proxy chain.
    logger.warn("rate limit key unresolvable, failing closed with 429", {
      hasForwardedFor: Boolean(forwardedFor),
      hasRemoteAddress: Boolean(remoteAddress),
      method: c.req.method,
      path: c.req.path,
      trustProxy: env.TRUST_PROXY,
    });
    recordRateLimitRejection("fail_closed");
    throw new HTTPException(429, {
      message: "Too many requests, please try again later.",
    });
  },
  // Docker healthchecks hit status every 30s; counting them burns the shared
  // local bucket and Redis round-trips, and readiness must never 429.
  skip: (c) => isHealthCheckPath(c.req.path),
});
