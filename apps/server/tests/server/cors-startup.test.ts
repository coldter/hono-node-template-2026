import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CORS_ORIGIN_REQUIRED_MESSAGE = /CORS_ORIGIN is required/i;

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
  vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/test");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("VAULT_MASTER_KEY", "0".repeat(64));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("server bootstrap CORS guard", () => {
  it("should throw at module load when CORS_ORIGIN is an empty array", async () => {
    vi.stubEnv("CORS_ORIGIN", "");

    await expect(import("@/server")).rejects.toThrowError(
      CORS_ORIGIN_REQUIRED_MESSAGE
    );
  });

  it("should load the app when CORS_ORIGIN contains at least one origin", async () => {
    vi.stubEnv("CORS_ORIGIN", "https://allowed.example.com");

    const server = await import("@/server");

    expect(server.default).toBeInstanceOf(OpenAPIHono);
  });
});
