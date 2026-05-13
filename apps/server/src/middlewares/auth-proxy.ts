import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import type { Env, RequestContext } from "@/lib/context";
import type { AuthInstance } from "@/modules/auth/instance";
import { sanitizedAuthRequest } from "@/modules/auth/sanitized-request";

/**
 * Sanitized Better Auth proxy boundary.
 *
 * Security contract:
 * 1. Unknown host (`requestContext.tenant === null`) → 404 via `HTTPException`.
 * 2. Proxy-supplied origin headers are stripped (see STRIPPED_HEADERS).
 * 3. `Host` is pinned to the resolved tenant's host so BA's URL resolver and
 *    cookie/CSRF checks cannot be confused by a spoofed forwarded host.
 * 4. Method, URL, body, redirect, referrer are forwarded verbatim.
 *
 * `authFactory` is captured at construction time — the proxy is the sole
 * consumer of the per-request BA instance, so no other middleware needs to
 * shuttle it through `c.var`.
 */
export function buildAuthProxyMiddleware(
  authFactory: (tenant: RequestContext["tenant"]) => AuthInstance
) {
  return createMiddleware<Env>(async (c) => {
    const tenant = c.var.requestContext.tenant;
    if (!tenant) {
      throw new HTTPException(404, { message: "Not Found" });
    }

    const auth = authFactory(tenant);
    const cleanReq = sanitizedAuthRequest(c.req.raw, tenant);
    return auth.handler(cleanReq);
  });
}
