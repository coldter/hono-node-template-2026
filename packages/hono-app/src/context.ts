import type { HttpBindings } from "@hono/node-server";

export type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Per-request envelope mounted on `c.var.requestContext`. Cooperatively
 * written by the chain — write order is load-bearing:
 *   requestContextInit -> seeds an empty envelope
 *   tenantBridge       -> writes `tenant`
 *   customOtel         -> writes `otel`
 *   authContext        -> writes `principal`
 *   auditContext       -> writes `audit`
 *
 * The auth instance is deliberately NOT on the envelope; the BA proxy
 * receives a per-request factory via closure instead.
 */
export type RequestContext<
  TPrincipal = null,
  TTenant = null,
  TAudit extends AuditContext = AuditContext,
> = {
  tenant: TTenant;
  principal: TPrincipal;
  otel: { traceId: string | null; spanId: string | null } | null;
  audit: TAudit;
};

export type AppEnv<TRequestContext> = {
  Variables: {
    requestContext: TRequestContext;
  };
  Bindings: HttpBindings;
};

export function createEmptyRequestContext<
  TPrincipal = null,
  TTenant = null,
  TAudit extends AuditContext = AuditContext,
>(seed: {
  principal: TPrincipal;
  tenant: TTenant;
  audit: TAudit;
}): RequestContext<TPrincipal, TTenant, TAudit> {
  return {
    tenant: seed.tenant,
    principal: seed.principal,
    otel: null,
    audit: seed.audit,
  };
}

/**
 * Test helper: shallow-merge a patch into the request-context envelope.
 * Production middlewares write full replacements; tests use this to seed
 * arbitrary subsets without reconstructing the whole envelope.
 */
export function setRequestContext<TRequestContext>(
  c: {
    get: (k: "requestContext") => TRequestContext | undefined;
    set: (k: "requestContext", v: TRequestContext) => void;
  },
  empty: TRequestContext,
  patch: Partial<TRequestContext>
): void {
  const current = c.get("requestContext") ?? empty;
  c.set("requestContext", { ...current, ...patch });
}
