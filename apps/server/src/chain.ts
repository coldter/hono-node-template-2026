/**
 * Order is captured as data: each entry has a `name` and an optional
 * `requires` list, and a boot-time well-formedness check fires if
 * `requires` ever references a later entry.
 */

import { httpInstrumentationMiddleware } from "@hono/otel";
import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  commonEntriesByName,
  type ChainEntry as PackageChainEntry,
  type MiddlewareChain as PackageMiddlewareChain,
  applyChain as packageApplyChain,
  assertChainWellFormed as packageAssertChainWellFormed,
} from "@repo/hono-app";
import {
  hostHeaderGuard,
  resolveDevTenantHeader,
  tenantMiddleware,
} from "@repo/tenancy";
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db, isDbSkipped } from "@/db";
import { env } from "@/env";
import type { Env, RequestContext } from "@/lib/context";
import { logger } from "@/lib/logger";
import { OTEL_ENABLED } from "@/lib/otel-config";
import { createRedisClient } from "@/lib/redis/client";
import {
  allowedHostsSnapshot,
  hostConfig,
  tenancyCache,
} from "@/lib/tenancy-runtime";
import { auditContextMiddleware } from "@/middlewares/audit-context";
import { buildAuthContextMiddleware } from "@/middlewares/auth-context";
import { buildAuthProxyMiddleware } from "@/middlewares/auth-proxy";
import { customOtelMiddleware } from "@/middlewares/otel";
import { globalRateLimitMW } from "@/middlewares/rate-limit";
import { requestContextInitMiddleware } from "@/middlewares/request-context-init";
import { type AuthInstance, createAuth } from "@/modules/auth/instance";
import type { JtiKillList } from "@/modules/auth/jti-kill-list";
import { createMemoryJtiKillList } from "@/modules/auth/jti-kill-list-memory";
import { createRedisJtiKillList } from "@/modules/auth/jti-kill-list-redis";
import {
  caddyAskHandler,
  caddyAskRateLimit,
} from "@/modules/tenancy/caddy-ask";

export type ChainEntry = PackageChainEntry<Env>;
export type MiddlewareChain = PackageMiddlewareChain<Env>;

/**
 * No-op stand-in for the `pg.Pool` surface `tenantMiddleware` reads. Used
 * when `SKIP_DB=true` so the resolver short-circuits to `not_found` without
 * touching Postgres.
 *
 * boundary: SKIP_DB test stub — runtime guard ensures the real DB is used
 * outside tests.
 */
const dbClientOrStub: Pick<import("pg").Pool, "query"> = isDbSkipped
  ? ({
      query: () =>
        Promise.resolve({
          rows: [],
          rowCount: 0,
          command: "",
          oid: 0,
          fields: [],
        }),
    } as unknown as Pick<import("pg").Pool, "query">)
  : db.$client;

const pingHandler: MiddlewareHandler<Env> = async (c) => {
  if (isDbSkipped) {
    return c.json({ message: "pong::dbStatus=skipped", dbStatus: true }, 200);
  }

  if (!db) {
    return c.json(
      { message: "pong::dbStatus=unavailable", dbStatus: false },
      503
    );
  }

  const dbResponse = await db.execute(sql`SELECT 1 AS one`);

  if (!dbResponse.rows.length) {
    return c.json({ message: "pong::dbStatus=error", dbStatus: false }, 500);
  }

  const isDbOk = dbResponse.rows[0]?.one === 1;
  return c.json(
    {
      message: `pong::dbStatus=${isDbOk ? "ok" : "error"}`,
      dbStatus: isDbOk,
    },
    isDbOk ? 200 : 500
  );
};

/**
 * Composition-time kill-list adapter selection. The interface (`JtiKillList`)
 * is the seam; this function chooses the adapter from env. Redis when
 * `REDIS_URL` is set, in-memory otherwise. Tests pass their own adapter to
 * `createAuth` directly and never reach this path.
 *
 * Connecting is fire-and-forget: `addKilled`/`isKilled` surface failures to
 * the logout caller, which tolerates them (see `runSessionDeleteAfter`). We
 * deliberately keep the noisy boot-time stack trace out of the path.
 */
function buildKillList(): JtiKillList {
  if (!env.REDIS_URL) {
    return createMemoryJtiKillList();
  }
  const redis = createRedisClient(env.REDIS_URL);
  redis.connect().catch(() => {
    // see comment above — surfaces on use, not on boot.
  });
  return createRedisJtiKillList(redis);
}

/**
 * Per-request Better Auth factory. Captured via closure by both the auth
 * proxy and auth-context middleware so `auth` never appears on `c.var`.
 */
function buildAuthFactory(
  killList: JtiKillList
): (tenant: RequestContext["tenant"]) => AuthInstance {
  return (tenant) =>
    createAuth({
      db,
      tenant,
      tenantConfig: hostConfig,
      allowedHostsSnapshot,
      logger,
      killList,
      extraTrustedOrigins: env.CORS_ORIGIN,
    });
}

export function buildChain(): MiddlewareChain {
  const entries: ChainEntry[] = [];
  const killList = buildKillList();
  const authFactory = buildAuthFactory(killList);
  const authContextMiddleware = buildAuthContextMiddleware(authFactory);
  const authProxyMiddleware = buildAuthProxyMiddleware(authFactory);

  // Shared common entries (init/trim/logger/cors/rateLimit/audit) live in
  // `@repo/hono-app`. Tenant-server interleaves the tenancy block between
  // the early and late common entries, so it cherry-picks via name rather
  // than spreading the full fragment. Audit-context requires
  // `authContextMiddleware` here (vs. admin-server's `requestContextInit`)
  // so the chain guarantees principal-aware audit writes downstream; cors
  // requires `tenantMiddleware` so a non-tenant host short-circuits before
  // any preflight allowance.
  const common = commonEntriesByName<Env>({
    requestContextInit: requestContextInitMiddleware,
    httpLoggerSink: (str, ...rest) => {
      logger.child({ label: "Http-Request" }).info(str, ...rest);
    },
    cors: {
      origin: Array.isArray(env.CORS_ORIGIN) ? env.CORS_ORIGIN : [],
      extraRequires: ["tenantMiddleware"],
    },
    globalRateLimit: globalRateLimitMW,
    auditContextMiddleware,
    auditContextRequires: ["authContextMiddleware"],
  });

  entries.push(common.requestContextInit);

  if (OTEL_ENABLED) {
    entries.push({
      kind: "use",
      name: "httpInstrumentation",
      mount: httpInstrumentationMiddleware({
        serviceName: "server",
        serviceVersion: "1.0.0",
        captureRequestHeaders: [
          "content-type",
          "accept",
          "user-agent",
          "traceparent",
        ],
        captureResponseHeaders: ["content-type", "content-length"],
      }),
    });
    entries.push({
      kind: "use",
      name: "customOtel",
      mount: customOtelMiddleware,
      requires: ["httpInstrumentation", "requestContextInit"],
    });
  }

  entries.push(common.trimTrailingSlash);
  entries.push(common.httpLogger);

  // /ping is tenant-agnostic — health checks must work without a tenant Host.
  entries.push({
    kind: "get",
    name: "ping",
    path: "/ping",
    handler: pingHandler,
  });

  // /caddy/ask is mounted before tenancy: Caddy polls with the Docker service
  // name or `localhost`, neither of which resolves to a tenant. Per-source-IP
  // rate-limited to bound a misconfigured polling loop. Internal network only.
  entries.push({
    kind: "use-path",
    name: "caddyAskRateLimit",
    path: "/caddy/ask",
    mount: caddyAskRateLimit,
  });
  entries.push({
    kind: "get",
    name: "caddyAsk",
    path: "/caddy/ask",
    handler: caddyAskHandler,
    requires: ["caddyAskRateLimit"],
  });

  // Tenant resolution short-circuits unknown hosts with a fast 404 before
  // any CORS or rate-limit work runs. No Postgres session variable is set —
  // tenancy is enforced in TS by repositories.
  entries.push({
    kind: "use",
    name: "hostHeaderGuard",
    mount: hostHeaderGuard({ config: hostConfig }),
  });

  // Gated at chain-build time so the entry never appears in a production
  // chain — defense in depth against a mis-set env in prod.
  // `resolveDevTenantHeader` also enforces the production guard at request
  // time.
  if (env.ALLOW_DEV_TENANT_HEADER === "1" && env.NODE_ENV !== "production") {
    entries.push({
      kind: "use",
      name: "devTenantHeader",
      mount: async (c, next) => {
        const raw = c.req.header("x-dev-tenant-slug");
        if (raw !== undefined && raw !== "") {
          const result = resolveDevTenantHeader(
            raw,
            hostConfig,
            env.ALLOW_DEV_TENANT_HEADER
          );
          if (result.kind === "rewrite") {
            // Rebuild the underlying Request with the rewritten Host so
            // every downstream consumer sees a consistent view.
            const original = c.req.raw;
            const headers = new Headers(original.headers);
            headers.set("host", result.host);
            const init: RequestInit = {
              method: original.method,
              headers,
              redirect: original.redirect,
              referrer: original.referrer,
            };
            if (
              original.body !== null &&
              original.method !== "GET" &&
              original.method !== "HEAD"
            ) {
              // boundary: lib.dom `RequestInit` does not yet include `duplex`,
              // but undici 7 / Node 20+ require it when `body` is a stream.
              (init as RequestInit & { duplex?: "half" }).duplex = "half";
              init.body = original.body;
            }
            c.req.raw = new Request(original.url, init);
          }
        }
        await next();
      },
      requires: ["hostHeaderGuard"],
    });
  }

  // The `onResolve` write-callback mirrors the resolved tenant into the
  // app's `requestContext.tenant` envelope. Replaces the deleted
  // `tenant-bridge` middleware — the package stays free of project-
  // specific request-context coupling while the host app owns the seam.
  entries.push({
    kind: "use",
    name: "tenantMiddleware",
    mount: tenantMiddleware({
      db: dbClientOrStub,
      cache: tenancyCache,
      config: hostConfig,
      waitUntil: (p) => {
        p.catch(() => undefined);
      },
      logger,
      onResolve: (c, tenant) => {
        const current = c.get("requestContext");
        c.set("requestContext", { ...current, tenant });
      },
    }),
    requires: ["hostHeaderGuard", "requestContextInit"],
  });

  entries.push(common.cors);
  entries.push(common.globalRateLimit);

  entries.push({
    kind: "use",
    name: "authContextMiddleware",
    mount: authContextMiddleware,
    requires: ["tenantMiddleware"],
  });
  entries.push(common.auditContextMiddleware);

  // Sanitized Better Auth proxy is the sole entry point for `/api/auth/*`.
  // Tenancy must be resolved before the proxy runs — the proxy 404s otherwise.
  entries.push({
    kind: "all",
    name: "authProxy",
    path: "/api/auth/*",
    handler: authProxyMiddleware,
    requires: ["tenantMiddleware"],
  });

  return Object.freeze(entries);
}

export function assertChainWellFormed(chain: MiddlewareChain): void {
  packageAssertChainWellFormed<Env>(chain);
}

export function applyChain(
  chain: MiddlewareChain,
  app: OpenAPIHono<Env>
): void {
  packageApplyChain<Env>(chain, app);
}

/** Production chain — frozen on import; well-formedness checked at boot. */
export const chain: MiddlewareChain = buildChain();
assertChainWellFormed(chain);
