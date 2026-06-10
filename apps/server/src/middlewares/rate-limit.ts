import { getConnInfo } from "@hono/node-server/conninfo";
import { HTTPException } from "hono/http-exception";
import type { Store } from "hono-rate-limiter";
import { rateLimiter } from "hono-rate-limiter";
import { ms } from "itty-time";
import type { RedisReply } from "rate-limit-redis";
import { RedisStore } from "rate-limit-redis";
import { env } from "@/env";
import { resolveRateLimitKey } from "@/lib/client-ip";
import type { Env } from "@/lib/context";
import { getRedis, isRedisEnabled } from "@/lib/redis";

const tooManyRequests = () => {
  throw new HTTPException(429, {
    message: "Too many requests, please try again later.",
  });
};

export const globalRateLimitMW = rateLimiter<Env>({
  windowMs: ms("1 minutes"),
  limit: 1000,
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
  keyGenerator: (c) => {
    let remoteAddress: string | undefined;
    try {
      remoteAddress = getConnInfo(c).remote.address ?? undefined;
    } catch {
      // getConnInfo throws outside the node-server runtime (tests, workers).
      remoteAddress = undefined;
    }

    const key = resolveRateLimitKey({
      forwardedFor: c.req.header("x-forwarded-for"),
      remoteAddress,
      trustProxy: env.TRUST_PROXY,
    });

    // Fail closed: a request with no resolvable client IP must not land in a
    // shared anonymous bucket.
    if (key) {
      return key;
    }
    throw new HTTPException(429, {
      message: "Too many requests, please try again later.",
    });
  },
  handler: tooManyRequests,
});
