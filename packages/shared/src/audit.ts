export const ACTOR_TYPES = {
  API: "api",
  SYSTEM: "system",
  USER: "user",
} as const;

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

export const TARGET_TYPES = {
  ROLE: "role",
  SESSION: "session",
  USER: "user",
} as const;

export type TargetType = (typeof TARGET_TYPES)[keyof typeof TARGET_TYPES];

export const AUDIT_EVENTS = {
  AUTH: {
    LOGIN_FAILED: {
      description: "Failed login attempt",
      event: "auth.login.failed",
    },
    LOGIN_SUCCESS: {
      description: "User logged in",
      event: "auth.login.success",
    },
    LOGOUT: { description: "User logged out", event: "auth.logout" },
    PASSWORD_CHANGED: {
      description: "Password changed",
      event: "auth.password.changed",
    },
    SESSION_REVOKED: {
      description: "Session revoked",
      event: "auth.session.revoked",
    },
  },
  ROLE: {
    ASSIGNED: { description: "Role assigned", event: "role.assigned" },
    CREATED: { description: "Role created", event: "role.created" },
    DELETED: { description: "Role deleted", event: "role.deleted" },
    UNASSIGNED: { description: "Role unassigned", event: "role.unassigned" },
    UPDATED: { description: "Role updated", event: "role.updated" },
  },
  USER: {
    ACTIVATED: { description: "User activated", event: "user.activated" },
    CREATED: { description: "User created", event: "user.created" },
    DEACTIVATED: { description: "User deactivated", event: "user.deactivated" },
    DELETED: { description: "User deleted", event: "user.deleted" },
    LISTED: { description: "Users listed", event: "user.listed" },
    UNLOCKED: { description: "User unlocked", event: "user.unlocked" },
    UPDATED: { description: "User updated", event: "user.updated" },
    VIEWED: { description: "User viewed", event: "user.viewed" },
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
