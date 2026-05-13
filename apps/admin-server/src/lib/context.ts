import type { OperatorPrincipal } from "@repo/authorization";
import {
  type AppEnv,
  type AuditContext,
  createEmptyRequestContext as createGenericEmptyRequestContext,
  type RequestContext as GenericRequestContext,
} from "@repo/hono-app";

/**
 * Re-export the canonical `OperatorPrincipal` from `@repo/authorization`.
 * The admin-server is the canonical consumer of the operator perimeter, so
 * the principal shape lives in the policy package next to `assertPermitted`
 * — local callers re-export it here for path-alias convenience.
 */
export type { OperatorPrincipal };

/**
 * App-specific specialization of the package's generic envelope. The
 * admin-server is tenant-agnostic, so `TTenant` is pinned to `null` —
 * there is no `tenantBridge` and no resolver to write into it.
 *
 *   requestContextInit  -> seeds an empty envelope
 *   auditContext        -> writes `requestContext.audit`
 *   (future B1.4)       -> writes `requestContext.principal`
 */
export type RequestContext = GenericRequestContext<
  OperatorPrincipal | null,
  null,
  AuditContext
>;

export type Env = AppEnv<RequestContext>;

/** Initial envelope. Subsequent middlewares mutate by replacement. */
export function createEmptyRequestContext(): RequestContext {
  return createGenericEmptyRequestContext<
    OperatorPrincipal | null,
    null,
    AuditContext
  >({
    principal: null,
    tenant: null,
    audit: {},
  });
}
