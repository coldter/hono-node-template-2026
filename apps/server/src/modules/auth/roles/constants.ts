import {
  SYSTEM_ROLE_SLUG_VALUES as SHARED_SYSTEM_ROLE_SLUG_VALUES,
  SYSTEM_ROLES as SHARED_SYSTEM_ROLES,
} from "@repo/shared/roles";
import { z } from "zod";
import { PERMISSIONS } from "./permissions";

export const SYSTEM_ROLES = SHARED_SYSTEM_ROLES;
export const SYSTEM_ROLE_SLUG_VALUES = SHARED_SYSTEM_ROLE_SLUG_VALUES;

export const systemRoleSlugSchema = z.enum(SYSTEM_ROLE_SLUG_VALUES);
export type SystemRoleSlug = z.infer<typeof systemRoleSlugSchema>;
export type RoleSlug = SystemRoleSlug | (string & {});

export function isSystemRole(slug: string): slug is SystemRoleSlug {
  return systemRoleSlugSchema.safeParse(slug).success;
}

export type {
  BasePermissionObject,
  PermissionIdentifier,
  PermissionKey,
  PermissionObject,
} from "@repo/shared/permissions";

export { getPermissionKey } from "@repo/shared/permissions";

export const PERMISSION_KEYS = Object.values(PERMISSIONS)
  .flatMap((group) => Object.values(group))
  .map((p) => p.key) as [string, ...string[]];
