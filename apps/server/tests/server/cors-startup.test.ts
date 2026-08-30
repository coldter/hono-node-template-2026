// Server captures CORS_ORIGIN at module load, so each scenario uses
// vi.resetModules + a fresh dynamic import to re-evaluate the guard.
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

  it("should throw at module load when CORS_ORIGIN is not an array", async () => {
    vi.doMock("@/env", () => ({
      env: {
        APP_NAME: "App",
        BASE_PATH: "",
        // Simulate misconfigured env where CORS_ORIGIN parse produced a non-array.
        // boundary: deliberately mistyped to verify the runtime guard.
        CORS_ORIGIN: undefined,
      },
    }));

    await expect(import("@/server")).rejects.toThrowError(
      CORS_ORIGIN_REQUIRED_MESSAGE
    );
  });

  it("should boot successfully when CORS_ORIGIN contains at least one origin", async () => {
    vi.doMock("@/env", () => ({
      env: {
        APP_NAME: "App",
        BASE_PATH: "",
        CORS_ORIGIN: ["https://example.com"],
      },
    }));

    const mod = await import("@/server");
    expect(mod.default).toBeDefined();
  });
});
