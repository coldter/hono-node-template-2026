/**
 * `/caddy/ask` — Caddy on-demand TLS authorization gate.
 *
 * Caddy issues a GET to this endpoint before provisioning a TLS
 * certificate for an unknown host (`tls { on_demand }` + `ask` directive
 * in the Caddyfile). A 200 grants the cert; a 404 denies it.
 *
 * INTERNAL-NETWORK ASSUMPTION
 * ---------------------------
 * This endpoint MUST NOT be exposed to the public internet. The Caddyfile
 * is responsible for routing `/caddy/ask` only on the closed Docker
 * network between Caddy and this server; the public site config will not
 * proxy it. Because the network is closed, we trust `x-forwarded-for`
 * for per-source-IP rate-limiting; if the deployment topology ever
 * changes, revisit this assumption.
 *
 * MOUNT POSITION (see `server.ts`)
 * --------------------------------
 *   - BEFORE `hostHeaderGuard` / `tenantMiddleware`: Caddy hits the
 *     server on `localhost` or the Docker service name, neither of
 *     which resolves to a tenant. Mounting before tenancy avoids a
 *     spurious 404 from the host guard.
 *   - BEFORE `authContextMiddleware`: Caddy has no Better Auth session.
 *   - AFTER `httpInstrumentationMiddleware` + `httpLogger`: we want
 *     observability of Caddy's polling cadence in OTel and request logs.
 *
 * SECURITY
 * --------
 *   - Reads only through `lookupCustomHostnameLifecycle` (the sanctioned
 *     single-purpose reader that projects only `lifecycle_status`).
 *   - Does NOT log the inbound `?domain` at info level — leaking tenant
 *     hostnames into platform logs would be a tenant-confidentiality bug.
 *   - Rejects null bytes / control characters before forwarding to the DB.
 *   - Per-source-IP rate limit (5 requests per 2 minutes) to bound a
 *     misconfigured/looping Caddy or a compromised internal client.
 */

import type { DrizzleClient } from "@repo/db";
import type { Context, MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { db } from "@/db";
import { resolveClientIp } from "@/lib/client-ip";
import type { Env } from "@/lib/context";
import { lookupCustomHostnameLifecycle } from "./lookup-custom-hostname-lifecycle";

/**
 * RFC 1035 host label charset (case-insensitive). Additionally allow `.`
 * between labels. Anything outside — including a URL-encoded null byte —
 * is rejected with 400 before reaching the DB layer.
 */
const HOSTNAME_CHARSET = /^[a-z0-9.-]+$/i;
const MAX_HOSTNAME_LENGTH = 253;

/**
 * Per-source-IP rate limit applied ONLY to the `/caddy/ask` route.
 * Window/burst chosen to match the Caddyfile `interval 2m, burst 5`
 * setting. Returns 429 with `Retry-After: 120` on overflow.
 */
export const caddyAskRateLimit: MiddlewareHandler<Env> = rateLimiter<Env>({
  windowMs: 2 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  keyGenerator: (c) => resolveClientIp(c),
  handler: (c) => {
    c.header("Retry-After", "120");
    return c.body(null, 429);
  },
});

export function createCaddyAskHandler(client: DrizzleClient) {
  return async function caddyAskHandler(c: Context<Env>) {
    const raw = c.req.query("domain");
    if (!raw) {
      return c.body(null, 400);
    }
    if (raw.length === 0 || raw.length > MAX_HOSTNAME_LENGTH) {
      return c.body(null, 400);
    }
    // Defensive: reject control chars / null bytes before lowercasing
    // so a smuggled `%00` cannot reach the DB layer.
    if (!HOSTNAME_CHARSET.test(raw)) {
      return c.body(null, 400);
    }
    const domain = raw.toLowerCase();
    const result = await lookupCustomHostnameLifecycle(client, domain);
    return c.body(null, result === "granted" ? 200 : 404);
  };
}

export const caddyAskHandler = createCaddyAskHandler(db);
