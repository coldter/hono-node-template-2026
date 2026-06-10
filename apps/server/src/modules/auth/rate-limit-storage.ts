// Structural subset of the redis v6 client: avoids the non-portable
// ReturnType<typeof createClient> generics and lets tests pass a plain fake.
type RateLimitRedisClient = {
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, seconds: number, value: string) => Promise<string>;
};

type RateLimitEntry = {
  key: string;
  count: number;
  lastRequest: number;
};

const KEY_PREFIX = "ba-rate-limit:";

export function createRedisRateLimitStorage(
  getClient: () => Promise<RateLimitRedisClient>,
  windowSeconds: number
) {
  // TTL = 2x window so an entry always outlives its own window but never leaks.
  // Constraint: customRules with windows longer than 2x the global window would
  // expire mid-window; keep rule windows at or below the global window.
  const ttlSeconds = windowSeconds * 2;

  return {
    get: async (key: string): Promise<RateLimitEntry | undefined> => {
      const client = await getClient();
      const raw = await client.get(KEY_PREFIX + key);
      if (!raw) {
        return;
      }
      // boundary: sole writer of these keys; value shape is our own serialization
      return JSON.parse(raw) as RateLimitEntry;
    },
    set: async (key: string, value: RateLimitEntry): Promise<void> => {
      const client = await getClient();
      await client.setEx(KEY_PREFIX + key, ttlSeconds, JSON.stringify(value));
    },
  };
}
