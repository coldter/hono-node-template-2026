/**
 * Operator-perimeter sanitized Better Auth proxy.
 *
 * Security contract (mirrors tenant-server's `auth-proxy`):
 *   1. Proxy-supplied origin headers (`X-Forwarded-*`, `Forwarded`,
 *      `CF-Connecting-IP`, `X-Real-IP`) are stripped.
 *   2. `Host` is pinned to the configured `ADMIN_HOST` so a spoofed
 *      forwarded host cannot influence BA's URL resolver, cookie domain,
 *      or CSRF check.
 *   3. Method, URL, body, redirect, and referrer are forwarded verbatim.
 *
 * Unlike the tenant proxy there is no `tenant === null -> 404` branch:
 * the admin perimeter has no tenant resolution to fail. A host-header
 * guard upstream rejects requests whose Host is not `ADMIN_HOST` before
 * they reach this middleware.
 */

import { STRIPPED_HEADERS, sanitizeAuthRequest } from "@repo/hono-app";
import { createMiddleware } from "hono/factory";
import type { Env } from "@/lib/context";
import type { AdminAuthInstance } from "@/modules/auth/instance";

// Re-exported so existing consumers (contract test, BA proxy diagnostics)
// keep their import paths stable. The canonical list lives in
// `@repo/hono-app`.
export { STRIPPED_HEADERS };

/**
 * Thin admin-perimeter wrapper around `@repo/hono-app`'s shared
 * `sanitizeAuthRequest`. Pins the trusted `ADMIN_HOST` so a spoofed
 * forwarded host cannot influence BA's URL resolver, cookie domain, or
 * CSRF check. See the header in `@repo/hono-app/sanitize-auth-request`
 * for the full security contract.
 */
export function sanitizedOperatorAuthRequest(
  req: Request,
  adminHost: string
): Request {
  return sanitizeAuthRequest(req, { pinHost: adminHost });
}

export function buildAuthProxyMiddleware(deps: {
  authFactory: () => AdminAuthInstance;
  adminHost: string;
}) {
  return createMiddleware<Env>(async (c) => {
    const auth = deps.authFactory();
    const cleanReq = sanitizedOperatorAuthRequest(c.req.raw, deps.adminHost);
    return auth.handler(cleanReq);
  });
}
