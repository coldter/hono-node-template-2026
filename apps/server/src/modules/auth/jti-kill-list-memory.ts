import type { JtiKillList } from "./jti-kill-list";

/**
 * In-memory adapter for tests and single-node dev. Stores `jti → expiresAtMs`
 * in a `Map` and evicts lazily on read. `now` is injected so tests can advance
 * deterministic clocks without relying on real wall-clock time.
 *
 * Contract note for `ttlSeconds = 0`: we treat it as "already expired" — the
 * jti is recorded but `isKilled` immediately returns false. That matches the
 * Redis adapter's behavior (Redis rejects `EX 0`, and the logout caller is
 * expected to clamp to ≥ 0 anyway).
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
