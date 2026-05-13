export const ACTOR_TYPES = {
  USER: "USER",
  GLOBAL_ADMIN: "GLOBAL_ADMIN",
  SYSTEM: "SYSTEM",
} as const;

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

export const TARGET_TYPES = {
  USER: "user",
  ROLE: "role",
  SESSION: "session",
  ORGANIZATION: "organization",
} as const;

export type TargetType = (typeof TARGET_TYPES)[keyof typeof TARGET_TYPES];

export const AUDIT_EVENTS = {
  AUTH: {
    LOGIN_SUCCESS: {
      event: "auth.login.success",
      description: "User logged in",
    },
    LOGIN_FAILED: {
      event: "auth.login.failed",
      description: "Failed login attempt",
    },
    LOGOUT: { event: "auth.logout", description: "User logged out" },
    PASSWORD_CHANGED: {
      event: "auth.password.changed",
      description: "Password changed",
    },
    SESSION_REVOKED: {
      event: "auth.session.revoked",
      description: "Session revoked",
    },
  },
  USER: {
    CREATED: { event: "user.created", description: "User created" },
    UPDATED: { event: "user.updated", description: "User updated" },
    DELETED: { event: "user.deleted", description: "User deleted" },
    DEACTIVATED: { event: "user.deactivated", description: "User deactivated" },
    ACTIVATED: { event: "user.activated", description: "User activated" },
    UNLOCKED: { event: "user.unlocked", description: "User unlocked" },
    VIEWED: { event: "user.viewed", description: "User viewed" },
    LISTED: { event: "user.listed", description: "Users listed" },
  },
  ROLE: {
    CREATED: { event: "role.created", description: "Role created" },
    UPDATED: { event: "role.updated", description: "Role updated" },
    DELETED: { event: "role.deleted", description: "Role deleted" },
    ASSIGNED: { event: "role.assigned", description: "Role assigned" },
    UNASSIGNED: { event: "role.unassigned", description: "Role unassigned" },
  },
  // Operator enrollment arrows: one event per state-machine arrow
  // (null → pending → bound | expired). Single-writer:
  // `apps/admin-server/src/modules/enroll/lifecycle.ts`.
  OPERATOR: {
    INVITED: {
      event: "operator.invited",
      description: "Operator enrollment invited",
    },
    REDEEMED: {
      event: "operator.redeemed",
      description: "Operator enrollment redeemed",
    },
    EXPIRED: {
      event: "operator.expired",
      description: "Operator enrollment expired",
    },
  },
  // Tenancy lifecycle arrows. Single-writer:
  // `packages/tenant-operations/src/organization-lifecycle.ts`.
  // `tenancy.user.session_revoked_mass` is the dual-scope companion event
  // for the suspend cascade.
  TENANCY: {
    ORG_CREATED: {
      event: "tenancy.org.created",
      description: "Organization created",
    },
    ORG_SUSPENDED: {
      event: "tenancy.org.suspended",
      description: "Organization suspended",
    },
    ORG_RESTORED: {
      event: "tenancy.org.restored",
      description: "Organization restored",
    },
    ORG_SOFT_DELETED: {
      event: "tenancy.org.softDeleted",
      description: "Organization soft-deleted",
    },
    USER_SESSION_REVOKED_MASS: {
      event: "tenancy.user.session_revoked_mass",
      description: "Mass session revocation on organization suspend",
    },
  },
} as const;

type AuditEventObject = {
  [K in keyof typeof AUDIT_EVENTS]: {
    [E in keyof (typeof AUDIT_EVENTS)[K]]: (typeof AUDIT_EVENTS)[K][E];
  }[keyof (typeof AUDIT_EVENTS)[K]];
}[keyof typeof AUDIT_EVENTS];

export type AuditEventKey = AuditEventObject extends { event: infer E }
  ? E extends string
    ? E
    : string
  : string;

export interface FieldChange<T = unknown> {
  from: T;
  to: T;
}

export interface AuditLogMetadata {
  changedFields?: string[];
  changes?: Record<string, FieldChange>;
  [key: string]: unknown;
}

// Events that occur alongside a database write.
// Must be logged transactionally via auditLogService.create(input, executor).
export const CRITICAL_EVENTS = [
  "user.created",
  "user.updated",
  "user.deleted",
  "user.deactivated",
  "user.activated",
  "user.unlocked",
  "auth.password.changed",
  "auth.session.revoked",
  "role.created",
  "role.updated",
  "role.deleted",
  "role.assigned",
  "role.unassigned",
  "tenancy.org.created",
  "tenancy.org.suspended",
  "tenancy.org.restored",
  "tenancy.org.softDeleted",
  "tenancy.user.session_revoked_mass",
  "operator.invited",
  "operator.redeemed",
  "operator.expired",
] as const;

// Observational events with no accompanying business write.
// Logged asynchronously via auditLogService.enqueue(input).
export const BUFFERABLE_EVENTS = [
  "auth.login.success",
  "auth.login.failed",
  "auth.logout",
  "user.viewed",
  "user.listed",
] as const;

export type CriticalAuditEvent = (typeof CRITICAL_EVENTS)[number];
export type BufferableAuditEvent = (typeof BUFFERABLE_EVENTS)[number];

// Exhaustiveness: a new AUDIT_EVENTS entry that isn't classified in one
// of the two arrays produces a type error here at build time.
type _AllClassified = CriticalAuditEvent | BufferableAuditEvent;
type _ExhaustivenessCheck = AuditEventKey extends _AllClassified ? true : never;

export type AuditClass = "critical" | "bufferable";

/**
 * Classify an audit event by its emission semantics:
 *   - "critical": occurs alongside a DB write; must be logged
 *     transactionally via `auditLogService.create(input, executor)`.
 *   - "bufferable": observational; may be logged async via
 *     `auditLogService.enqueue(input)`.
 *
 * Static guarantee: `_ExhaustivenessCheck` above proves every
 * `AuditEventKey` is a member of `CRITICAL_EVENTS` ∪ `BUFFERABLE_EVENTS`,
 * so the throw branch is dead in well-typed code. It remains as a
 * runtime backstop for callers that pass through an unverified string.
 */
export function auditClassOf(event: AuditEventKey): AuditClass {
  for (const critical of CRITICAL_EVENTS) {
    if (critical === event) {
      return "critical";
    }
  }
  for (const bufferable of BUFFERABLE_EVENTS) {
    if (bufferable === event) {
      return "bufferable";
    }
  }
  throw new Error(`Unclassified audit event: ${event}`);
}
