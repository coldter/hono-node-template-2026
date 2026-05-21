import { describe, expect, it } from "vitest";
import { createMemoryJtiKillList } from "../jti-kill-list-memory";

function fixedClock(start: number): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe("createMemoryJtiKillList", () => {
  it("marks a jti as killed for the duration of its ttl", async () => {
    const kl = createMemoryJtiKillList();
    await kl.addKilled("jti_alpha", 60);
    expect(await kl.isKilled("jti_alpha")).toBe(true);
  });

  it("returns false for an unknown jti", async () => {
    const kl = createMemoryJtiKillList();
    expect(await kl.isKilled("jti_never_seen")).toBe(false);
  });

  it("expires the jti once ttl elapses", async () => {
    const clock = fixedClock(1_000_000);
    const kl = createMemoryJtiKillList(clock.now);

    await kl.addKilled("jti_t", 30);
    expect(await kl.isKilled("jti_t")).toBe(true);

    clock.advance(29_999);
    expect(await kl.isKilled("jti_t")).toBe(true);

    clock.advance(2);
    expect(await kl.isKilled("jti_t")).toBe(false);
  });

  it("evicts on read once expired so a later isKilled remains false", async () => {
    const clock = fixedClock(0);
    const kl = createMemoryJtiKillList(clock.now);

    await kl.addKilled("jti_evict", 5);
    clock.advance(10_000);
    expect(await kl.isKilled("jti_evict")).toBe(false);
    expect(await kl.isKilled("jti_evict")).toBe(false);
  });

  it("tracks multiple jtis independently", async () => {
    const clock = fixedClock(0);
    const kl = createMemoryJtiKillList(clock.now);

    await kl.addKilled("jti_short", 1);
    await kl.addKilled("jti_long", 100);

    clock.advance(2000);

    expect(await kl.isKilled("jti_short")).toBe(false);
    expect(await kl.isKilled("jti_long")).toBe(true);
  });

  it("treats ttlSeconds=0 as already expired", async () => {
    // Mirrors the Redis adapter: non-positive ttl is never observed as killed.
    const clock = fixedClock(1_000_000);
    const kl = createMemoryJtiKillList(clock.now);

    await kl.addKilled("jti_zero", 0);
    expect(await kl.isKilled("jti_zero")).toBe(false);
  });
});
