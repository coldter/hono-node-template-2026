import { describe, expect, it, vi } from "vitest";
import type { RedisClient } from "@/lib/redis/client";
import { createRedisJtiKillList } from "../jti-kill-list-redis";

type SetArgs = [key: string, value: string, options: { EX: number }];

function makeStubRedis(): {
  redis: RedisClient;
  setMock: ReturnType<typeof vi.fn>;
  existsMock: ReturnType<typeof vi.fn>;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const setMock = vi.fn(async (k: string, v: string, _opts: { EX: number }) => {
    store.set(k, v);
    return "OK" as const;
  });
  const existsMock = vi.fn(async (k: string) => (store.has(k) ? 1 : 0));

  // boundary: structural stub matches the adapter's call surface; real RedisClientType
  // carries module-augmented command generics the stub can't express.
  const redis = { set: setMock, exists: existsMock } as unknown as RedisClient;
  return { redis, setMock, existsMock, store };
}

describe("createRedisJtiKillList", () => {
  it("writes the jti under the jti:kill: prefix with the supplied ttl", async () => {
    const { redis, setMock } = makeStubRedis();
    const kl = createRedisJtiKillList(redis);

    await kl.addKilled("jti_xyz", 120);

    expect(setMock).toHaveBeenCalledTimes(1);
    const [k, v, opts] = setMock.mock.calls[0] as SetArgs;
    expect(k).toBe("jti:kill:jti_xyz");
    expect(v).toBe("1");
    expect(opts).toEqual({ EX: 120 });
  });

  it("returns true when EXISTS reports a positive count", async () => {
    const { redis } = makeStubRedis();
    const kl = createRedisJtiKillList(redis);

    await kl.addKilled("jti_present", 60);
    expect(await kl.isKilled("jti_present")).toBe(true);
  });

  it("returns false when EXISTS reports zero", async () => {
    const { redis, existsMock } = makeStubRedis();
    const kl = createRedisJtiKillList(redis);

    expect(await kl.isKilled("jti_missing")).toBe(false);
    const [k] = existsMock.mock.calls[0] as [string];
    expect(k).toBe("jti:kill:jti_missing");
  });

  it("skips the SET when ttl is non-positive (matches memory adapter)", async () => {
    const { redis, setMock } = makeStubRedis();
    const kl = createRedisJtiKillList(redis);

    await kl.addKilled("jti_already_expired", 0);
    await kl.addKilled("jti_neg", -5);

    expect(setMock).not.toHaveBeenCalled();
  });

  it("namespaces every key under the jti:kill: prefix", async () => {
    const { redis, setMock, existsMock } = makeStubRedis();
    const kl = createRedisJtiKillList(redis);

    await kl.addKilled("a", 30);
    await kl.isKilled("b");

    const setKey = (setMock.mock.calls[0] as SetArgs)[0];
    const existsKey = (existsMock.mock.calls[0] as [string])[0];
    expect(setKey.startsWith("jti:kill:")).toBe(true);
    expect(existsKey.startsWith("jti:kill:")).toBe(true);
  });
});
