import {
  type AppEnv,
  type AuditContext,
  createEmptyRequestContext as createGenericEmptyRequestContext,
  type RequestContext as GenericRequestContext,
  setRequestContext as setGenericRequestContext,
} from "@repo/hono-app";
import type { Tenant } from "@repo/tenancy";
import type { Principal } from "@/modules/auth/principal";

/**
 * Legacy alias preserved for callers that still type-import the
 * BA-flavoured principal shape. New code should depend on `Principal`
 * from `@/modules/auth/principal` directly.
 */
export type TenantUserPrincipal = Extract<Principal, { kind: "authenticated" }>;

/**
 * App envelope. Slots are written by the middleware chain:
 *   tenantMiddleware (onResolve) -> requestContext.tenant (mirrored from `c.var.tenant`)
 *   customOtel   -> requestContext.otel
 *   authContext  -> requestContext.principal
 *   auditContext -> requestContext.audit
 *
 * Better Auth is NOT carried here; the sole consumer (`authProxyMiddleware`)
 * receives a per-request factory via closure.
 *
 * `principal` is a discriminated union with an explicit `kind: "anonymous"`
 * arm — callers branch on `kind` rather than null-checking the slot.
 */
export type RequestContext = GenericRequestContext<
  Principal,
  Tenant | null,
  AuditContext
>;

export type Env = AppEnv<RequestContext>;

const ANONYMOUS_PRINCIPAL: Principal = Object.freeze({ kind: "anonymous" });

export function createEmptyRequestContext(): RequestContext {
  return createGenericEmptyRequestContext<
    Principal,
    Tenant | null,
    AuditContext
  >({
    principal: ANONYMOUS_PRINCIPAL,
    tenant: null,
    audit: {},
  });
}

/** Shallow-merge an override into the envelope. Test-helper only. */
export function setRequestContext(
  c: {
    get: (k: "requestContext") => RequestContext | undefined;
    set: (k: "requestContext", v: RequestContext) => void;
  },
  patch: Partial<RequestContext>
): void {
  setGenericRequestContext(c, createEmptyRequestContext(), patch);
}
