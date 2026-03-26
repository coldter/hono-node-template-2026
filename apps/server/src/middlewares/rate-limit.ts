import { HTTPException } from "hono/http-exception";
import { rateLimiter } from "hono-rate-limiter";
import { ms } from "itty-time";
import type { Env } from "@/lib/context";

export const globalRateLimitMW = rateLimiter<Env>({
  windowMs: ms("1 minutes"),
  limit: 1000,
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "",
  handler: () => {
    throw new HTTPException(429, {
      message: "Too many requests, please try again later.",
    });
  },
});
