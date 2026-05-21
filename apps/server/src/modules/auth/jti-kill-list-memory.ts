import type { JtiKillList } from "./jti-kill-list";

/**
 * In-memory adapter for tests / single-node dev. Lazy eviction on read; `now`
 * is injected for deterministic test clocks. `ttlSeconds = 0` is "already
 * expired" — matches the Redis adapter's behavior (Redis rejects `EX 0`).
 */
export function createMemoryJtiKillList(
  now: () => number = Date.now
): JtiKillList {
  const store = new Map<string, number>();

  return {
    addKilled(jti, ttlSeconds) {
      store.set(jti, now() + ttlSeconds * 1000);
      return Promise.resolve();
    },
    isKilled(jti) {
      const expiresAt = store.get(jti);
      if (expiresAt === undefined) {
        return Promise.resolve(false);
      }
      if (expiresAt <= now()) {
        store.delete(jti);
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    },
  };
}
