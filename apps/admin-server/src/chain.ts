/**
 * Admin-server middleware chain. Operator-facing, tenant-agnostic: no
 * tenant resolver, no SSO plugin. The chain primitives live in
 * `@repo/hono-app`; this module declares the admin-specific entries and
 * their ordering.
 *
 * Ordering invariants captured as data on `requires` so a mis-wire fires
 * at boot time via `assertChainWellFormed`.
 */

import type { OpenAPIHono } from "@hono/zod-openapi";
import {
  commonEntries,
  type ChainEntry as PackageChainEntry,
  type MiddlewareChain as PackageMiddlewareChain,
  applyChain as packageApplyChain,
  assertChainWellFormed as packageAssertChainWellFormed,
} from "@repo/hono-app";
import type { MiddlewareHandler } from "hono";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { auditContextMiddleware } from "@/middlewares/audit-context";
import { buildAuthContextMiddleware } from "@/middlewares/auth-context";
import { buildAuthProxyMiddleware } from "@/middlewares/auth-proxy";
import { globalRateLimitMW } from "@/middlewares/rate-limit";
import { requestContextInitMiddleware } from "@/middlewares/request-context-init";
import type { AdminAuthInstance } from "@/modules/auth/instance";

export type ChainEntry = PackageChainEntry<Env>;
export type MiddlewareChain = PackageMiddlewareChain<Env>;

/**
 * Health-check handler. Tenant-agnostic by design — mounted before any
 * host-header guard so liveness probes work without setting `Host`.
 */
const pingHandler: MiddlewareHandler<Env> = async (c) =>
  c.json({ message: "pong" });

export type ChainDeps = Readonly<{
  /**
   * Per-request BA factory. The chain wires both the auth-context reader
   * and the `/api/auth/*` proxy through this single seam so tests can
   * substitute a stub instance without rebuilding the chain.
   */
  authFactory: () => AdminAuthInstance;
}>;

export function buildChain(deps?: ChainDeps): MiddlewareChain {
  const entries: ChainEntry[] = [];

  // Shared baseline: requestContextInit -> trimTrailingSlash -> httpLogger
  // -> cors -> globalRateLimit -> auditContextMiddleware. The factory
  // pulls hono middlewares and wires app-supplied mounts; default
  // `audit.requires` of `requestContextInit` is what admin-server needs.
  const common = commonEntries<Env>({
    requestContextInit: requestContextInitMiddleware,
    cors: {
      origin: Array.isArray(env.ADMIN_CORS_ORIGIN) ? env.ADMIN_CORS_ORIGIN : [],
    },
    globalRateLimit: globalRateLimitMW,
    auditContextMiddleware,
  });

  // Splice the /ping handler in after the httpLogger so probes are
  // logged but skip downstream cors/rate-limit/audit overhead.
  for (const entry of common) {
    entries.push(entry);
    if (entry.name === "httpLogger") {
      entries.push({
        kind: "get",
        name: "ping",
        path: "/ping",
        handler: pingHandler,
      });
    }
  }

  if (deps) {
    // Reads the operator session and stamps `requestContext.principal`.
    // No data coupling to `auditContextMiddleware`: audit-context seeds
    // the HTTP envelope (ip, user-agent) from request headers and does
    // NOT read `principal`. Downstream handlers project the operator
    // actor-id from `requestContext.principal` at audit-write time, so
    // `authContext` only requires `requestContextInit` to be present.
    entries.push({
      kind: "use",
      name: "authContext",
      mount: buildAuthContextMiddleware(deps.authFactory),
      requires: ["requestContextInit"],
    });

    // Sanitised BA proxy. Path-scoped to `/api/auth/*` so the operator
    // session lookup in `authContext` (above) runs first for non-auth
    // routes and can short-circuit on a missing session, while the proxy
    // itself still accepts unauthenticated traffic (sign-in flows).
    entries.push({
      kind: "use-path",
      name: "authProxy",
      path: "/api/auth/*",
      mount: buildAuthProxyMiddleware({
        authFactory: deps.authFactory,
        adminHost: env.ADMIN_HOST,
      }),
      requires: ["authContext"],
    });
  }

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

// The default chain has no BA wiring; tests that need the auth chain
// entries pass `buildChain(deps)` directly.
export const chain: MiddlewareChain = buildChain();
assertChainWellFormed(chain);
