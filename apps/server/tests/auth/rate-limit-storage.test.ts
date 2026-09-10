import { describe, expect, it, vi } from "vitest";
import { createRedisRateLimitStorage } from "@/modules/auth/rate-limit-storage";

function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    store,
  };
}

describe("createRedisRateLimitStorage", () => {
  it("should round-trip a rate limit entry", async () => {
    const fake = makeFakeRedis();
    const storage = createRedisRateLimitStorage(async () => fake, 60);

    await storage.set("key1", { count: 3, key: "key1", lastRequest: 1000 });
    const entry = await storage.get("key1");

    expect(entry).toEqual({ count: 3, key: "key1", lastRequest: 1000 });
  });

  it("should set a TTL so keys cannot accumulate forever", async () => {
    const fake = makeFakeRedis();
    const storage = createRedisRateLimitStorage(async () => fake, 60);

    await storage.set("key1", { count: 1, key: "key1", lastRequest: 1 });

    expect(fake.setEx).toHaveBeenCalledWith(
      "ba-rate-limit:key1",
      120,
      expect.any(String)
    );
  });
});
