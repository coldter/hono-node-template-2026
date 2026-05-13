import type { Context, MiddlewareHandler } from "hono";
import type { Client, Pool } from "pg";
import type { TenancyCache } from "./cache";
import type { HostConfig } from "./host-config";
import { resolveTenant } from "./resolve-tenant";
import type { Tenant } from "./types";

declare module "hono" {
  interface ContextVariableMap {
    tenant: Tenant | null;
  }
}

export type TenantMiddlewareOptions = Readonly<{
  db: Pick<Client | Pool, "query">;
  cache: TenancyCache;
  config: HostConfig;
  waitUntil: (p: Promise<unknown>) => void;
  logger?: {
    info(o: Record<string, unknown>): void;
    warn(o: Record<string, unknown>): void;
  };
  /**
   * Optional write-callback fired AFTER `c.var.tenant` is set and BEFORE
   * `next()` runs. Lets the host app mirror the resolved tenant into a
   * project-specific envelope (e.g. `c.var.requestContext.tenant`)
   * without coupling this package to the host's request-context shape.
   */
  onResolve?: (c: Context, tenant: Tenant) => void;
}>;

const RETRY_AFTER_SECONDS = "60";
const STATUS_NOT_FOUND = 404;
const STATUS_SUSPENDED = 503;

export function tenantMiddleware(
  opts: TenantMiddlewareOptions
): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host") ?? "";
    const result = await resolveTenant(host, {
      db: opts.db,
      cache: opts.cache,
      config: opts.config,
      waitUntil: opts.waitUntil,
    });

    if (result.kind === "not_found") {
      opts.logger?.info({ event: "tenancy.not_found", host });
      return c.text("Not Found", STATUS_NOT_FOUND);
    }

    if (result.kind === "suspended") {
      opts.logger?.warn({
        event: "tenancy.suspended",
        host,
        organizationId: result.tenant.organizationId,
      });
      return c.text("Service Unavailable", STATUS_SUSPENDED, {
        "Retry-After": RETRY_AFTER_SECONDS,
      });
    }

    c.set("tenant", result);
    opts.onResolve?.(c, result);
    await next();
    return;
  };
}
