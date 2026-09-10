import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Executor } from "@/db";
import { createStatusHandler } from "@/modules/status/handler";
import {
  checkReadiness,
  type ReadinessChecks,
  type ReadinessDependencies,
} from "@/modules/status/service";

const readinessBodySchema = z.object({
  checks: z.object({
    database: z.boolean(),
    redis: z.boolean().nullable(),
  }),
  status: z.enum(["ok", "unavailable"]),
});

function fakeDatabase(execute: () => Promise<void>): Executor {
  // SAFETY: the readiness probe only calls db.execute and awaits it, so the proxy answering every member with the probe is a complete double for that call path.
  return new Proxy({} as Executor, { get: () => execute });
}

function redisDependencies(options: {
  enabled: boolean;
  ping: () => Promise<string>;
}): ReadinessDependencies["redis"] {
  return {
    getClient: async () => ({ ping: options.ping }),
    isEnabled: () => options.enabled,
  };
}

function handlerReturning(checks: ReadinessChecks) {
  return createStatusHandler(async () => checks);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("checkReadiness", () => {
  it("reports the database ready and redis unset when redis is not configured", async () => {
    const checks = await checkReadiness({
      database: fakeDatabase(async () => {}),
      redis: redisDependencies({ enabled: false, ping: async () => "PONG" }),
    });

    expect(checks).toEqual({ database: true, redis: null });
  });

  it("reports the database not ready when the probe rejects", async () => {
    const checks = await checkReadiness({
      database: fakeDatabase(() =>
        Promise.reject(new Error("connection refused"))
      ),
      redis: redisDependencies({ enabled: false, ping: async () => "PONG" }),
    });

    expect(checks).toEqual({ database: false, redis: null });
  });

  it("reports redis not ready when redis is configured but unreachable", async () => {
    const checks = await checkReadiness({
      database: fakeDatabase(async () => {}),
      redis: redisDependencies({
        enabled: true,
        ping: () => Promise.reject(new Error("redis down")),
      }),
    });

    expect(checks).toEqual({ database: true, redis: false });
  });

  it("reports redis ready when redis is configured and reachable", async () => {
    const checks = await checkReadiness({
      database: fakeDatabase(async () => {}),
      redis: redisDependencies({ enabled: true, ping: async () => "PONG" }),
    });

    expect(checks).toEqual({ database: true, redis: true });
  });

  it("marks the database not ready when the probe exceeds the timeout", async () => {
    const checks = await checkReadiness(
      {
        database: fakeDatabase(() => new Promise<void>(() => undefined)),
        redis: redisDependencies({ enabled: false, ping: async () => "PONG" }),
      },
      20
    );

    expect(checks).toEqual({ database: false, redis: null });
  });

  it("treats a missing database dependency as skipped", async () => {
    const checks = await checkReadiness({
      database: null,
      redis: redisDependencies({ enabled: false, ping: async () => "PONG" }),
    });

    expect(checks).toEqual({ database: true, redis: null });
  });
});

describe("GET /ready", () => {
  it("should return 200 with redis null when db is up and redis is not configured", async () => {
    const res = await handlerReturning({
      database: true,
      redis: null,
    }).request("/ready");

    expect(res.status).toBe(200);
    expect(readinessBodySchema.parse(await res.json())).toEqual({
      checks: { database: true, redis: null },
      status: "ok",
    });
  });

  it("should return 503 when the database probe fails", async () => {
    const res = await handlerReturning({
      database: false,
      redis: null,
    }).request("/ready");

    expect(res.status).toBe(503);
    expect(readinessBodySchema.parse(await res.json())).toEqual({
      checks: { database: false, redis: null },
      status: "unavailable",
    });
  });

  it("should return 503 when redis is configured but unreachable", async () => {
    const res = await handlerReturning({
      database: true,
      redis: false,
    }).request("/ready");

    expect(res.status).toBe(503);
    expect(readinessBodySchema.parse(await res.json())).toEqual({
      checks: { database: true, redis: false },
      status: "unavailable",
    });
  });

  it("should return 200 when redis is configured and reachable", async () => {
    const res = await handlerReturning({
      database: true,
      redis: true,
    }).request("/ready");

    expect(res.status).toBe(200);
    expect(readinessBodySchema.parse(await res.json())).toEqual({
      checks: { database: true, redis: true },
      status: "ok",
    });
  });

  it("wires the real readiness dependencies through the default handler", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.resetModules();

    const { default: freshStatusHandler } = await import(
      "@/modules/status/handler"
    );
    const res = await freshStatusHandler.request("/ready");

    expect(res.status).toBe(200);
    expect(readinessBodySchema.parse(await res.json())).toEqual({
      checks: { database: true, redis: null },
      status: "ok",
    });
  });
});
