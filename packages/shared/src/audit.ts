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

export type AuditEventKey = string;
