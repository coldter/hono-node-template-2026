/**
 * Tenant-perimeter wrapper over `@repo/hono-app`'s shared
 * `sanitizeAuthRequest`. Carries the resolved tenant in so the pinned
 * host is derived from a trusted source (the tenant's authoritative host,
 * resolved upstream by `tenantMiddleware`) rather than an inbound header.
 *
 * The header-stripping list (`STRIPPED_HEADERS`) and the `duplex: "half"`
 * boundary annotation live in the shared helper — see that module for
 * the security rationale.
 */

import { STRIPPED_HEADERS, sanitizeAuthRequest } from "@repo/hono-app";
import type { Tenant } from "@repo/tenancy";

export { STRIPPED_HEADERS };

export function sanitizedAuthRequest(req: Request, tenant: Tenant): Request {
  return sanitizeAuthRequest(req, { pinHost: tenant.host });
}
