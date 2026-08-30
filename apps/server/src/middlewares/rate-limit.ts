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

            return client.sendCommand<RedisReply>(args);
          },
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

    if (key) {
      return key;
    }

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

  skip: (c) => isHealthCheckPath(c.req.path),
});
