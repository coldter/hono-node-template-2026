import { HTTPException } from "hono/http-exception";
import type { HonoConfigProps, Store } from "hono-rate-limiter";
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

interface RedisRateLimitStore {
  decrement(key: string): Promise<void>;
  get(
    key: string
  ): Promise<{ totalHits: number; resetTime?: Date } | undefined>;
  increment(key: string): Promise<{ totalHits: number; resetTime?: Date }>;
  init(options: { windowMs: number }): Promise<void>;
  resetKey(key: string): Promise<void>;
}

function createRedisRateLimitStore(): Store<Env> {
  const store: RedisRateLimitStore = new RedisStore({
    prefix: "global-rl:",
    sendCommand: async (...args: string[]) => {
      const client = await getRedis();

      return client.sendCommand<RedisReply>(args);
    },
  });

  return {
    decrement: (key) => store.decrement(key),
    get: (key) => store.get(key),
    increment: (key) => store.increment(key),
    init: (options) => store.init(options),
    resetKey: (key) => store.resetKey(key),
  };
}

const baseRateLimitOptions = {
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
  limit: 1000,

  skip: (c) => isHealthCheckPath(c.req.path),
  windowMs: ms("1 minutes"),
} satisfies HonoConfigProps<Env>;

export const globalRateLimitMW = rateLimiter<Env>(
  isRedisEnabled()
    ? { ...baseRateLimitOptions, store: createRedisRateLimitStore() }
    : baseRateLimitOptions
);
