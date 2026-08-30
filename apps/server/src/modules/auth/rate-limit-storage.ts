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

function getRetryAfter(lastRequest: number, window: number): number {
  const now = Date.now();
  const windowInMs = window * 1000;
  return Math.ceil((lastRequest + windowInMs - now) / 1000);
}

export function createRedisRateLimitStorage(
  getClient: () => Promise<RateLimitRedisClient>,
  windowSeconds: number
) {
  const defaultTtl = windowSeconds * 2;

  const get = async (key: string): Promise<RateLimitEntry | undefined> => {
    const client = await getClient();
    const raw = await client.get(KEY_PREFIX + key);
    if (!raw) {
      return;
    }
    // boundary: sole writer of these keys; value shape is our own serialization
    return JSON.parse(raw) as RateLimitEntry;
  };

  const set = async (key: string, value: RateLimitEntry): Promise<void> => {
    const client = await getClient();
    await client.setEx(KEY_PREFIX + key, defaultTtl, JSON.stringify(value));
  };

  const consume = async (
    key: string,
    rule: { window: number; max: number }
  ): Promise<{ allowed: boolean; retryAfter: number | null }> => {
    const client = await getClient();
    const fullKey = KEY_PREFIX + key;
    const raw = await client.get(fullKey);
    const now = Date.now();
    const windowInMs = rule.window * 1000;

    let data: RateLimitEntry | undefined;
    if (raw) {
      try {
        data = JSON.parse(raw) as RateLimitEntry;
      } catch {
        data = undefined;
      }
    }

    const ttl = rule.window ? rule.window * 2 : defaultTtl;

    if (!data) {
      const next: RateLimitEntry = { count: 1, key, lastRequest: now };
      await client.setEx(fullKey, ttl, JSON.stringify(next));
      return { allowed: true, retryAfter: null };
    }

    if (now - data.lastRequest >= windowInMs) {
      const next: RateLimitEntry = { ...data, count: 1, lastRequest: now };
      await client.setEx(fullKey, ttl, JSON.stringify(next));
      return { allowed: true, retryAfter: null };
    }

    if (data.count >= rule.max) {
      return {
        allowed: false,
        retryAfter: getRetryAfter(data.lastRequest, rule.window),
      };
    }

    const next: RateLimitEntry = {
      ...data,
      count: data.count + 1,
      lastRequest: now,
    };
    await client.setEx(fullKey, ttl, JSON.stringify(next));
    return { allowed: true, retryAfter: null };
  };

  return {
    consume,
    get,
    set,
  };
}
