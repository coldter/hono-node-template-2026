/**
 * Thin wrapper around `node-redis` so the rest of the codebase imports a
 * single typed surface. The actual transport is a private impl detail of the
 * caller (e.g. the `JtiKillList` Redis adapter) — we don't re-export Redis
 * types beyond what's needed for an adapter to call `set` / `exists`.
 */
import { createClient, type RedisClientType } from "redis";

export type RedisClient = RedisClientType;

/**
 * Constructs (but does not auto-connect) a node-redis client. Callers own the
 * lifecycle: `await client.connect()` on boot, `await client.quit()` on
 * shutdown. We deliberately do NOT introduce a process-wide singleton here —
 * the server bootstrap owns the single instance and threads it into the
 * adapters that need it.
 */
export function createRedisClient(url: string): RedisClient {
  return createClient({ url });
}
