// Operator (global-admin) policy. Operators are NOT tenant members; this
// module never reads organizationId — keep that invariant if you add actions.
// boundary: drizzle-orm generic variance (Column, SQL)
import { type Column, inArray, type SQL } from "drizzle-orm";

export type OperatorSubRole = "platform_admin" | "support" | "read_only";

export type OperatorAction =
  | "tenant.create"
  | "tenant.list"
  | "tenant.read"
  | "tenant.suspend"
  | "tenant.restore"
  | "tenant.delete"
  | "sso_provider.create"
  | "sso_provider.list"
  | "sso_provider.read"
  | "sso_provider.update"
  | "sso_provider.delete"
  | "custom_hostname.list"
  | "custom_hostname.force_remove"
  | "global_admin.invite"
  | "global_admin.revoke"
  | "global_admin.list"
  | "global_admin.expire"
  | "audit_log.read"
  | "support.query";

// Canonical action -> allowed sub-roles. Source of truth for the matrix.
const ACTION_TO_ROLES: Record<OperatorAction, readonly OperatorSubRole[]> = {
  "tenant.create": ["platform_admin"],
  "tenant.list": ["platform_admin", "support", "read_only"],
  "tenant.read": ["platform_admin", "support", "read_only"],
  "tenant.suspend": ["platform_admin"],
  "tenant.restore": ["platform_admin"],
  "tenant.delete": ["platform_admin"],
  "sso_provider.create": ["platform_admin"],
  "sso_provider.list": ["platform_admin", "support", "read_only"],
  // read_only excluded -- decrypted secret exposure risk.
  "sso_provider.read": ["platform_admin", "support"],
  "sso_provider.update": ["platform_admin"],
  "sso_provider.delete": ["platform_admin"],
  "custom_hostname.list": ["platform_admin", "support", "read_only"],
  "custom_hostname.force_remove": ["platform_admin"],
  "global_admin.invite": ["platform_admin"],
  "global_admin.revoke": ["platform_admin"],
  "global_admin.expire": ["platform_admin"],
  "global_admin.list": ["platform_admin", "support", "read_only"],
  "audit_log.read": ["platform_admin", "support"],
  // Tenant-data query path; callers MUST emit CRITICAL audit, cap rows
  // (1000), and rate-limit. Adding new roles here without those guards
  // exposes raw tenant data.
  "support.query": ["platform_admin", "support"],
};

const SUB_ROLES = [
  "platform_admin",
  "support",
  "read_only",
] as const satisfies readonly OperatorSubRole[];

function buildRolePermissions(): Record<
  OperatorSubRole,
  ReadonlySet<OperatorAction>
> {
  const draft: Record<OperatorSubRole, Set<OperatorAction>> = {
    platform_admin: new Set(),
    support: new Set(),
    read_only: new Set(),
  };
  for (const [action, roles] of Object.entries(ACTION_TO_ROLES) as [
    OperatorAction,
    readonly OperatorSubRole[],
  ][]) {
    for (const role of roles) {
      draft[role].add(action);
    }
  }
  return draft;
}

export const OPERATOR_PERMISSIONS: Record<
  OperatorSubRole,
  ReadonlySet<OperatorAction>
> = buildRolePermissions();

// Prefer `assertPermitted` / `OPERATOR_PERMISSIONS`; this is for matrix tests.
export const OPERATOR_ACTIONS = Object.keys(
  ACTION_TO_ROLES
) as readonly OperatorAction[];

export const OPERATOR_SUB_ROLES: readonly OperatorSubRole[] = SUB_ROLES;

/**
 * Canonical operator principal shape shared across `@repo/authorization`
 * consumers (admin-server adapter, policy gate). The `operator` substructure
 * groups the identity fields so the wider `RequestContext.principal` union
 * (which may include non-operator variants in future) stays discriminable
 * via `kind`, and so callers don't have to project the policy-relevant
 * fields out of a flat shape.
 */
export interface OperatorPrincipal {
  kind: "operator";
  operator: {
    id: string;
    subRole: OperatorSubRole;
    /**
     * Email is optional at this layer — the policy gate never reads it,
     * but downstream audit emitters do. Carrying it here lets the
     * principal flow through `assertPermitted` without a separate
     * projection.
     */
    email?: string;
  };
}

export interface AuthFailure {
  code: "FORBIDDEN" | "UNAUTHENTICATED";
  message: string;
}

/**
 * Pure gate: returns `null` when permitted, or an `AuthFailure` the caller
 * maps to an `APIError`. Logging / audit is the adapter's responsibility.
 */
export function assertPermitted(
  principal: OperatorPrincipal | null,
  action: OperatorAction
): AuthFailure | null {
  if (!principal) {
    return {
      code: "UNAUTHENTICATED",
      message: "Operator session required",
    };
  }
  const allowed = OPERATOR_PERMISSIONS[principal.operator.subRole];
  if (!allowed.has(action)) {
    return {
      code: "FORBIDDEN",
      message: `Operator sub-role '${principal.operator.subRole}' cannot perform '${action}'`,
    };
  }
  return null;
}

// boundary: drizzle-orm generic variance — typed as Column so the
// `inArray` overload resolves without importing @repo/db here.
type GlobalAdminsTable = {
  subRole: Column;
};

/**
 * Drizzle predicate for `global_admins.sub_role IN (...)`. Returns
 * `undefined` for an empty list so `and(...)` composition does not emit
 * a vacuous `IN ()` fragment (which Postgres rejects).
 */
export function whereGlobalAdminRole(
  table: GlobalAdminsTable,
  subRoles: readonly OperatorSubRole[]
): SQL | undefined {
  if (subRoles.length === 0) {
    return;
  }
  return inArray(table.subRole, [...subRoles]);
}
