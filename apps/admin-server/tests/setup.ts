import type { Context, Next } from "hono";
import { vi } from "vitest";

/**
 * Bypass rate-limit in tests. Behavioural coverage of rate limiting lives
 * in dedicated suites; route-level tests would otherwise need to clear
 * keys between cases.
 */
vi.mock("@/middlewares/rate-limit", () => ({
  rateLimiter: vi.fn().mockReturnValue(async (_: Context, next: Next) => {
    await next();
  }),
  globalRateLimitMW: async (_: Context, next: Next) => {
    await next();
  },
}));
