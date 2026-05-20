import { type Tenant, useTenant } from "@repo/tenancy";
import { createMiddleware } from "hono/factory";

import type { Env } from "@/lib/context";
import type { AuthInstance } from "@/modules/auth/instance";
import { sanitizedAuthRequest } from "@/modules/auth/sanitized-request";

// `sanitizedAuthRequest` strips proxy-origin headers and pins Host to tenant.host so BA URL/CSRF checks cannot be spoofed by a forwarded host.
export function buildAuthProxyMiddleware(
  authFactory: (tenant: Tenant) => AuthInstance
) {
  return createMiddleware<Env>(async (c) => {
    const tenant = useTenant(c);
    const auth = authFactory(tenant);
    const cleanReq = sanitizedAuthRequest(c.req.raw, tenant);
    return auth.handler(cleanReq);
  });
}
