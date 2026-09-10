import type { Context, Next } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CORS_ORIGIN_REQUIRED_MESSAGE = /CORS_ORIGIN is required/i;

vi.mock("@/middlewares/rate-limit", () => ({
  globalRateLimitMW: async (_c: Context, next: Next) => {
    await next();
  },
  rateLimiter: () => async (_c: Context, next: Next) => {
    await next();
  },
}));

vi.mock("@/middlewares/auth-context", () => ({
  authContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

vi.mock("@/middlewares/audit-context", () => ({
  auditContextMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

vi.mock("@/middlewares/otel", () => ({
  customOtelMiddleware: async (_c: Context, next: Next) => {
    await next();
  },
}));

vi.mock("@/db", () => ({
  db: {},
  isDbSkipped: true,
}));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("@/env");
});

describe("server bootstrap CORS guard", () => {
  it("should throw at module load when CORS_ORIGIN is an empty array", async () => {
    vi.doMock("@/env", () => ({
      env: {
        APP_NAME: "App",
        BASE_PATH: "",
        CORS_ORIGIN: [],
      },
    }));

    await expect(import("@/server")).rejects.toThrowError(
      CORS_ORIGIN_REQUIRED_MESSAGE
    );
  });
});
