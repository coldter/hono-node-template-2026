import type { Simplify, ValueOf } from "type-fest";

export type PermissionObject = {
  readonly key: string;
  readonly description: string;
};

export const PERMISSIONS = {
  // ────────────────────────────────────────────────────────────
  // ADMIN DASHBOARD (Admin only)
  // ────────────────────────────────────────────────────────────
  DASHBOARD: {
    ACCESS: { key: "dashboard:access", description: "Access admin dashboard" },
  },

  // ────────────────────────────────────────────────────────────
  // USER PERMISSIONS
  // ────────────────────────────────────────────────────────────
  USERS: {
    VIEW: { key: "users:view", description: "View users" },
    CREATE: { key: "users:create", description: "Create users" },
    UPDATE: { key: "users:update", description: "Update user profile" },
    DELETE: { key: "users:delete", description: "Delete users" },
    DEACTIVATE: { key: "users:deactivate", description: "Deactivate users" },
    ACTIVATE: { key: "users:activate", description: "Activate users" },
    UNLOCK: { key: "users:unlock", description: "Unlock locked users" },
  },

  ROLES: {
    VIEW: { key: "roles:view", description: "View roles" },
    UPDATE: { key: "roles:update", description: "Update roles" },
  },

  AUDIT_LOGS: {
    VIEW: { key: "audit-logs:view", description: "View audit logs" },
  },
} as const satisfies Record<string, Record<string, PermissionObject>>;

type ExtractPermissionObjects<T> = T extends PermissionObject
  ? T
  : T extends object
    ? ValueOf<{ [K in keyof T]: ExtractPermissionObjects<T[K]> }>
    : never;

export type BasePermissionObject = Simplify<
  ExtractPermissionObjects<typeof PERMISSIONS>
>;

export type PermissionKey = BasePermissionObject["key"] | "*";
export type PermissionIdentifier = PermissionKey | BasePermissionObject;

export function getPermissionKey(
  permission: PermissionIdentifier
): PermissionKey {
  return typeof permission === "string" ? permission : permission.key;
}

export type NavItemPermission =
  | PermissionIdentifier
  | PermissionIdentifier[]
  | null
  | undefined;

export function isNoPermissionRequired(
  permission: NavItemPermission
): permission is null | undefined {
  return permission === null || permission === undefined;
}

export function isMultiplePermissions(
  permission: NavItemPermission
): permission is PermissionIdentifier[] {
  return Array.isArray(permission);
}
