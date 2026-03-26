import type {
  BasePermissionObject,
  PermissionIdentifier,
  PermissionKey,
  PermissionObject,
  RoleSlug,
  SystemRoleSlug,
} from "./constants";
import type { GenericPermissionObject } from "./permissions";

/**
 * User type with role information
 */
export type UserWithRoles = {
  roleSlugs: string[];
};

/**
 * Re-export types from constants for convenience
 */
export type {
  BasePermissionObject,
  GenericPermissionObject,
  PermissionIdentifier,
  PermissionKey,
  PermissionObject,
  RoleSlug,
  SystemRoleSlug,
};
