import { LRUCache } from "lru-cache";
import type { CachedShape } from "./types";

export type CreateTenancyCacheOptions = {
  /** Read the current durable cache version; composed into every key. */
  version?: () => string;
  max?: number;
  /** Positive-entry TTL (ms). Negative entries use a shorter TTL. */
  ttl?: number;
  negativeTtl?: number;
};

/**
 * In-process tenant-resolution cache. Key composition `${version}:${host}`
 * lets a durable version bump invalidate every entry without iterating the
 * LRU; negative entries get a shorter TTL than positive ones.
 */
export type TenancyCache = Readonly<{
  get(host: string): CachedShape | undefined;
  set(host: string, value: CachedShape): void;
  clearLocal(): void;
  size(): number;
}>;

const DEFAULT_MAX = 10_000;
const DEFAULT_POSITIVE_TTL_MS = 60_000;
const DEFAULT_NEGATIVE_TTL_MS = 5000;

export function createTenancyCache(
  opts: CreateTenancyCacheOptions = {}
): TenancyCache {
  const version = opts.version ?? (() => "0");
  const positiveTtl = opts.ttl ?? DEFAULT_POSITIVE_TTL_MS;
  const negativeTtl = opts.negativeTtl ?? DEFAULT_NEGATIVE_TTL_MS;
  const lru = new LRUCache<string, CachedShape>({
    max: opts.max ?? DEFAULT_MAX,
    ttl: positiveTtl,
    ttlAutopurge: false,
    allowStale: false,
  });
  const keyFor = (host: string): string => `${version()}:${host}`;
  return Object.freeze({
    get: (host) => lru.get(keyFor(host)),
    set: (host, value) => {
      const ttl = value.kind === "not_found" ? negativeTtl : positiveTtl;
      lru.set(keyFor(host), value, { ttl });
    },
    clearLocal: () => {
      lru.clear();
    },
    size: () => lru.size,
  });
}
