import { HTTPException } from "hono/http-exception";
import { rateLimiter } from "hono-rate-limiter";
import { ms } from "itty-time";
import type { Env } from "@/lib/context";

/**
 * Global rate limit for admin-server. Tighter than tenant-server's 1000/min:
 * the operator surface has far fewer legitimate callers, so a lower ceiling
 * raises the cost of credential stuffing without hurting normal use.
 */
export const globalRateLimitMW = rateLimiter<Env>({
  windowMs: ms("1 minutes"),
  limit: 200,
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "",
  handler: () => {
    throw new HTTPException(429, {
      message: "Too many requests, please try again later.",
    });
  },
});
