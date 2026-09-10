import { z } from "zod";

type RateLimitRedisClient = {
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, seconds: number, value: string) => Promise<string>;
};

const rateLimitEntrySchema = z.object({
  count: z.number(),
  key: z.string(),
  lastRequest: z.number(),
});

type RateLimitEntry = z.infer<typeof rateLimitEntrySchema>;

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

    const parsed = rateLimitEntrySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
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
        const parsed = rateLimitEntrySchema.safeParse(JSON.parse(raw));
        data = parsed.success ? parsed.data : undefined;
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
