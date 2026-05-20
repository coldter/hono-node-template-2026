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
  type Tenant,
  tenantMiddleware,
} from "@repo/tenancy";
import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db, isDbSkipped } from "@/db";
import { env } from "@/env";
import type { Env } from "@/lib/context";
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

// boundary: SKIP_DB test stub for `tenantMiddleware`'s pg.Pool surface — resolver short-circuits to `not_found` without touching Postgres.
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

function buildKillList(): JtiKillList {
  if (!env.REDIS_URL) {
    return createMemoryJtiKillList();
  }
  const redis = createRedisClient(env.REDIS_URL);
  // Fire-and-forget: connect failures surface on use (logout path tolerates them), not on boot.
  redis.connect().catch(() => undefined);
  return createRedisJtiKillList(redis);
}

function buildAuthFactory(
  killList: JtiKillList
): (tenant: Tenant) => AuthInstance {
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

  // audit-context requires `authContextMiddleware` so audit writes see the principal; cors requires `tenantMiddleware` so non-tenant hosts short-circuit before any preflight allowance.
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

  // /ping is tenant-agnostic so health checks work without a tenant Host.
  entries.push({
    kind: "get",
    name: "ping",
    path: "/ping",
    handler: pingHandler,
  });

  // /caddy/ask is mounted before tenancy because Caddy polls with the Docker service name or `localhost`, neither of which resolves to a tenant. Internal network only.
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

  // Host guard must run before CORS/rate-limit so unknown hosts 404 fast.
  entries.push({
    kind: "use",
    name: "hostHeaderGuard",
    mount: hostHeaderGuard({ config: hostConfig }),
  });

  // Defense in depth: chain-build gate keeps the entry out of production chains; `resolveDevTenantHeader` also enforces a production guard at request time.
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
            // Rebuild the Request with the rewritten Host so every downstream consumer sees a consistent view.
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

  // `tenantMiddleware` writes `c.var.tenant` — the single seam; downstream reads via `useTenant`/`useTenantMaybe`. No mirror into the request-context envelope.
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

export const chain: MiddlewareChain = buildChain();
assertChainWellFormed(chain);
