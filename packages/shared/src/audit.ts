export const ACTOR_TYPES = {
  USER: "user",
  SYSTEM: "system",
  API: "api",
} as const;

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

export const TARGET_TYPES = {
  USER: "user",
  ROLE: "role",
  SESSION: "session",
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
} as const;

// Narrow type: union of all event strings from AUDIT_EVENTS
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

// Compile-time exhaustiveness check: ensures every event in AuditEventKey
// is classified in exactly one of the two arrays. If a new event is added
// to AUDIT_EVENTS but not classified, this will produce a type error.
type _AllClassified = CriticalAuditEvent | BufferableAuditEvent;
type _ExhaustivenessCheck = AuditEventKey extends _AllClassified ? true : never;
