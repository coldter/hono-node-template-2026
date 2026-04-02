import {
  LEGACY_PERMISSION_KEYS,
  type LegacyPermissionKey,
  SYSTEM_ROLE_SLUG_VALUES as SHARED_SYSTEM_ROLE_SLUG_VALUES,
  SYSTEM_ROLES as SHARED_SYSTEM_ROLES,
} from "@repo/shared/authorization";

export const SYSTEM_ROLES = SHARED_SYSTEM_ROLES;
export const SYSTEM_ROLE_SLUG_VALUES = SHARED_SYSTEM_ROLE_SLUG_VALUES;

export type PermissionKey = LegacyPermissionKey;

export const PERMISSION_KEYS = [...LEGACY_PERMISSION_KEYS];
