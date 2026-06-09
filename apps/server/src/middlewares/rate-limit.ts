import { getConnInfo } from "@hono/node-server/conninfo";
import { HTTPException } from "hono/http-exception";
import { rateLimiter } from "hono-rate-limiter";
import { ms } from "itty-time";
import { env } from "@/env";
import { resolveRateLimitKey } from "@/lib/client-ip";
import type { Env } from "@/lib/context";

const tooManyRequests = () => {
  throw new HTTPException(429, {
    message: "Too many requests, please try again later.",
  });
};

export const globalRateLimitMW = rateLimiter<Env>({
  windowMs: ms("1 minutes"),
  limit: 1000,
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
