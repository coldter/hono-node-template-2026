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

function handlerFor(dependencies: ReadinessDependencies, timeoutMs?: number) {
  return createStatusHandler(() => checkReadiness(dependencies, timeoutMs));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const redisUnset = redisDependencies({
  enabled: false,
  ping: async () => "PONG",
});
const databaseUp = () => fakeDatabase(async () => {});

describe("GET /ready", () => {
  it("maps every database and redis probe outcome to 200 or 503", async () => {
    const scenarios: {
      dependencies: ReadinessDependencies;
      expected: { checks: ReadinessChecks; status: 200 | 503 };
      timeoutMs?: number;
    }[] = [
      {
        dependencies: { database: databaseUp(), redis: redisUnset },
        expected: { checks: { database: true, redis: null }, status: 200 },
      },
      {
        dependencies: {
          database: fakeDatabase(() =>
            Promise.reject(new Error("connection refused"))
          ),
          redis: redisUnset,
        },
        expected: { checks: { database: false, redis: null }, status: 503 },
      },
      {
        dependencies: {
          database: fakeDatabase(() => new Promise<void>(() => undefined)),
          redis: redisUnset,
        },
        expected: { checks: { database: false, redis: null }, status: 503 },
        timeoutMs: 20,
      },
      {
        dependencies: { database: null, redis: redisUnset },
        expected: { checks: { database: true, redis: null }, status: 200 },
      },
      {
        dependencies: {
          database: databaseUp(),
          redis: redisDependencies({
            enabled: true,
            ping: () => Promise.reject(new Error("redis down")),
          }),
        },
        expected: { checks: { database: true, redis: false }, status: 503 },
      },
      {
        dependencies: {
          database: databaseUp(),
          redis: redisDependencies({ enabled: true, ping: async () => "PONG" }),
        },
        expected: { checks: { database: true, redis: true }, status: 200 },
      },
    ];

    await Promise.all(
      scenarios.map(async (scenario) => {
        const response = await handlerFor(
          scenario.dependencies,
          scenario.timeoutMs
        ).request("/ready");

        expect(response.status).toBe(scenario.expected.status);
        expect(readinessBodySchema.parse(await response.json())).toEqual({
          checks: scenario.expected.checks,
          status: scenario.expected.status === 200 ? "ok" : "unavailable",
        });
      })
    );
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

    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:1");
    vi.resetModules();

    const { default: unreachableRedisHandler } = await import(
      "@/modules/status/handler"
    );
    const unreachableRes = await unreachableRedisHandler.request("/ready");

    expect(unreachableRes.status).toBe(503);
    expect(readinessBodySchema.parse(await unreachableRes.json())).toEqual({
      checks: { database: true, redis: false },
      status: "unavailable",
    });
  });
});
