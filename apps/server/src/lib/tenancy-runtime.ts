/**
 * Process-wide tenancy runtime singletons consumed by the middleware chain.
 *
 * Lives in its own module to break an import cycle: `server.ts` previously
 * owned these, but `auth-context.ts` and `docs.ts` (both imported BY
 * `server.ts`) need to read them at module-init time.
 */

import {
  createTenancyCache,
  type HostConfig,
  loadHostConfig,
  type TenancyCache,
} from "@repo/tenancy";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import {
  type AllowedHostsSnapshot,
  buildAllowedHostsSnapshot,
} from "@/modules/auth/auth-host-policy";

export const hostConfig: HostConfig = loadHostConfig({
  APP_WILDCARD_HOST: env.APP_WILDCARD_HOST,
  ADMIN_HOST: env.ADMIN_HOST,
  FALLBACK_HOST: env.FALLBACK_HOST,
  NODE_ENV: env.NODE_ENV,
});

let currentCacheVersion = "0";

export function setCurrentCacheVersion(v: string): void {
  currentCacheVersion = v;
}

export function getCurrentCacheVersion(): string {
  return currentCacheVersion;
}

export const tenancyCache: TenancyCache = createTenancyCache({
  version: () => currentCacheVersion,
});

// Invalid URLs are logged and skipped so a typo surfaces without crashing
// process boot.
function deriveLocalDevHosts(): string[] {
  return env.CORS_ORIGIN.flatMap((origin) => {
    try {
      return [new URL(origin).host];
    } catch (error) {
      logger.warn("Invalid CORS_ORIGIN entry skipped from local-dev hosts", {
        origin,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  });
}

export const allowedHostsSnapshot: AllowedHostsSnapshot =
  buildAllowedHostsSnapshot({
    hostConfig,
    customHosts: [],
    localDevHosts: deriveLocalDevHosts(),
  });
