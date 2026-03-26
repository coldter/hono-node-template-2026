import { useCallback, useMemo } from "react";

import { useUserStore } from "@/store/user";
import type { NavItemPermission, PermissionIdentifier } from "./types";
import {
  getPermissionKey,
  isMultiplePermissions,
  isNoPermissionRequired,
} from "./types";

export function usePermission() {
  const user = useUserStore((state) => state.user);
  const permissions = user?.permissions ?? [];

  const permissionSet = useMemo(
    () => new Set<string>(permissions),
    [permissions]
  );

  const hasPermission = useCallback(
    (permission: PermissionIdentifier): boolean => {
      if (permissionSet.has("*")) {
        return true;
      }

      const key = getPermissionKey(permission);
      return permissionSet.has(key);
    },
    [permissionSet]
  );

  const hasAnyPermission = useCallback(
    (permissionList: PermissionIdentifier[]): boolean => {
      if (permissionList.length === 0) {
        return true;
      }
      return permissionList.some((p) => hasPermission(p));
    },
    [hasPermission]
  );

  const hasAllPermissions = useCallback(
    (permissionList: PermissionIdentifier[]): boolean => {
      if (permissionList.length === 0) {
        return true;
      }
      return permissionList.every((p) => hasPermission(p));
    },
    [hasPermission]
  );

  const checkNavItemPermission = useCallback(
    (permission: NavItemPermission): boolean => {
      if (isNoPermissionRequired(permission)) {
        return true;
      }

      if (isMultiplePermissions(permission)) {
        return hasAnyPermission(permission);
      }

      return hasPermission(permission);
    },
    [hasPermission, hasAnyPermission]
  );

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    checkNavItemPermission,
  };
}
