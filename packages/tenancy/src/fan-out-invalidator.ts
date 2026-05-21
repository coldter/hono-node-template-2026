import { bumpTenantCacheVersion, type Executor } from "@repo/db";
import type { TenancyCache } from "./cache";

/**
 * Writer surface for tenant-cache invalidation. Split into a durable
 * counter bump (caller's transaction) and a best-effort post-commit
 * broadcast so a single transition only writes the version row once.
 *
 *   - `bumpDurable(tx)` — durable counter increment INSIDE the caller's
 *     transaction (so the bump rolls back if the transition aborts).
 *   - `broadcast(host?)` — post-commit Hatchet push (best-effort) plus
 *     local LRU clear; never throws.
 */
export type Invalidator = Readonly<{
  bumpDurable(tx: Executor): Promise<void>;
  broadcast(host?: string): Promise<void>;
}>;

export type HatchetEventBus = Readonly<{
  events: { push(key: string, payload: object): Promise<unknown> };
}>;

export type CreateFanOutInvalidatorOptions = Readonly<{
  hatchet: HatchetEventBus;
  cache?: TenancyCache;
  logger?: {
    error(o: Record<string, unknown>): void;
    info(o: Record<string, unknown>): void;
  };
}>;

const EVENT_KEY = "tenancy.invalidate";

export function createFanOutInvalidator(
  deps: CreateFanOutInvalidatorOptions
): Invalidator {
  return Object.freeze({
    async bumpDurable(tx: Executor): Promise<void> {
      await bumpTenantCacheVersion(tx);
    },
    async broadcast(host?: string): Promise<void> {
      try {
        const payload = host ? { host } : { event: "bump_all" };
        await deps.hatchet.events.push(EVENT_KEY, payload);
      } catch (err) {
        deps.logger?.error({
          event: "tenancy.invalidate.push_failed",
          host,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      // Local LRU clear is part of broadcast — the production invalidator
      // owns it as a private implementation detail.
      deps.cache?.clearLocal();
    },
  });
}
