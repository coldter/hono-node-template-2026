import type { RedisClient } from "@/lib/redis/client";
import type { JtiKillList } from "./jti-kill-list";

const KEY_PREFIX = "jti:kill:";

function key(jti: string): string {
  return `${KEY_PREFIX}${jti}`;
}

/**
 * Redis adapter. Stores killed jtis as TTL'd keys so eviction is the
 * transport's job, not ours. The key prefix isolates kill-list entries from
 * other uses of the same Redis instance (rate-limits, locks, etc.).
 */
export function createRedisJtiKillList(redis: RedisClient): JtiKillList {
  return {
    async addKilled(jti, ttlSeconds) {
      if (ttlSeconds <= 0) {
        // Redis rejects `EX 0` / negative TTLs; mirror the memory adapter
        // and treat a non-positive ttl as "already expired" — do nothing.
        return;
      }
      await redis.set(key(jti), "1", { EX: ttlSeconds });
    },
    async isKilled(jti) {
      // boundary: node-redis exists returns numeric 0|1.
      const exists = await redis.exists(key(jti));
      return exists > 0;
    },
  };
}
