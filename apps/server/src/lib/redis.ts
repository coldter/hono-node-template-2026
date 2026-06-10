import { createClient } from "redis";
import { env } from "@/env";
import { logger } from "@/lib/logger";

// Wrapper exists so RedisClient names the concrete instantiation createClient
// actually returns; ReturnType<typeof createClient> picks the generic
// signature's defaults, which are not mutually assignable with it.
function createRedisClient(url: string) {
  return createClient({ url });
}

type RedisClient = ReturnType<typeof createRedisClient>;

// Memoize the promise (not the client) so concurrent callers racing before
// connect() resolves share a single connection instead of creating two.
let clientPromise: Promise<RedisClient> | null = null;

export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

export function getRedis(): Promise<RedisClient> {
  const url = env.REDIS_URL;
  if (!url) {
    return Promise.reject(
      new Error("getRedis() called without REDIS_URL configured")
    );
  }
  if (clientPromise) {
    return clientPromise;
  }
  const pending = (async () => {
    const client = createRedisClient(url);
    client.on("error", (error: Error) => {
      logger.error("Redis client error", { error: error.message });
    });
    await client.connect();
    return client;
  })();
  clientPromise = pending;
  return pending;
}

export async function closeRedis(): Promise<void> {
  if (!clientPromise) {
    return;
  }
  const pending = clientPromise;
  clientPromise = null;
  const client = await pending;
  await client.close();
}
