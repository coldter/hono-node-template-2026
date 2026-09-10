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
  it("round-trips entries under a namespaced key with a double-window TTL", async () => {
    const fake = makeFakeRedis();
    const storage = createRedisRateLimitStorage(async () => fake, 60);
    const entry = { count: 3, key: "key1", lastRequest: 1000 };

    await storage.set("key1", entry);

    await expect(storage.get("key1")).resolves.toEqual(entry);
    expect(fake.setEx).toHaveBeenCalledWith(
      "ba-rate-limit:key1",
      120,
      JSON.stringify(entry)
    );
  });
});
