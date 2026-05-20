import {
  type AppEnv,
  type AuditContext,
  createEmptyRequestContext as createGenericEmptyRequestContext,
  type RequestContext as GenericRequestContext,
  setRequestContext as setGenericRequestContext,
} from "@repo/hono-app";
import type { Principal } from "@/modules/auth/principal";

export type TenantUserPrincipal = Extract<Principal, { kind: "authenticated" }>;

// Resolved tenant is NOT mirrored here — it lives on `c.var.tenant` (see `@repo/tenancy`). Better Auth is supplied per-request via closure, not c.var.
export type RequestContext = GenericRequestContext<
  Principal,
  null,
  AuditContext
>;

export type Env = AppEnv<RequestContext>;

const ANONYMOUS_PRINCIPAL: Principal = Object.freeze({ kind: "anonymous" });

export function createEmptyRequestContext(): RequestContext {
  return createGenericEmptyRequestContext<Principal, null, AuditContext>({
    principal: ANONYMOUS_PRINCIPAL,
    tenant: null,
    audit: {},
  });
}

// Test-helper only.
export function setRequestContext(
  c: {
    get: (k: "requestContext") => RequestContext | undefined;
    set: (k: "requestContext", v: RequestContext) => void;
  },
  patch: Partial<RequestContext>
): void {
  setGenericRequestContext(c, createEmptyRequestContext(), patch);
}
