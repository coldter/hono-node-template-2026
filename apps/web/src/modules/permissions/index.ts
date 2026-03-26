// Ability-based permissions (CASL)
export { AbilityProvider, useAbility, useCan } from "./ability-context";
export { Can, Cannot } from "./can";

// String-based permissions
export type { PermissionObject } from "./constants";
export { PERMISSIONS } from "./constants";
export { PermissionDenied } from "./permission-denied";
export { PermissionGuard } from "./permission-guard";
export { Protected } from "./protected";
export type {
  BasePermissionObject,
  NavItemPermission,
  PermissionIdentifier,
  PermissionKey,
} from "./types";
export {
  getPermissionKey,
  isMultiplePermissions,
  isNoPermissionRequired,
} from "./types";
export { usePermission } from "./use-permission";
