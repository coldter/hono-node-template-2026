import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  ping: vi.fn(),
  redisEnabled: { value: false },
}));

vi.mock("@/db", () => ({
  isDbSkipped: false,
  db: { execute: mocks.execute },
}));

vi.mock("@/lib/redis", () => ({
  isRedisEnabled: () => mocks.redisEnabled.value,
  getRedis: async () => ({ ping: mocks.ping }),
}));

import statusHandler from "@/modules/status/handler";
import { checkReadiness } from "@/modules/status/service";

type ReadinessBody = {
  status: "ok" | "unavailable";
  checks: { database: boolean; redis: boolean | null };
};

beforeEach(() => {
  mocks.execute.mockReset().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  mocks.ping.mockReset().mockResolvedValue("PONG");
  mocks.redisEnabled.value = false;
});

describe("GET /ready", () => {
  it("should return 200 with redis null when db is up and redis is not configured", async () => {
    const res = await statusHandler.request("/ready");

    expect(res.status).toBe(200);
    expect((await res.json()) as ReadinessBody).toEqual({
      status: "ok",
      checks: { database: true, redis: null },
    });
  });

  it("should return 503 when the database probe fails", async () => {
    mocks.execute.mockRejectedValue(new Error("connection refused"));

    const res = await statusHandler.request("/ready");

    expect(res.status).toBe(503);
    expect((await res.json()) as ReadinessBody).toEqual({
      status: "unavailable",
      checks: { database: false, redis: null },
    });
  });

  it("should return 503 when redis is configured but unreachable", async () => {
    mocks.redisEnabled.value = true;
    mocks.ping.mockRejectedValue(new Error("redis down"));

    const res = await statusHandler.request("/ready");

    expect(res.status).toBe(503);
    expect((await res.json()) as ReadinessBody).toEqual({
      status: "unavailable",
      checks: { database: true, redis: false },
    });
  });

  it("should return 200 when redis is configured and reachable", async () => {
    mocks.redisEnabled.value = true;

    const res = await statusHandler.request("/ready");

    expect(res.status).toBe(200);
    expect((await res.json()) as ReadinessBody).toEqual({
      status: "ok",
      checks: { database: true, redis: true },
    });
  });
});

describe("checkReadiness", () => {
  it("should mark the database not ready when the probe exceeds the timeout", async () => {
    mocks.execute.mockReturnValue(new Promise(() => undefined));

    const checks = await checkReadiness(20);

    expect(checks.database).toBe(false);
  });
});
