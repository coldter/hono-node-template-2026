import { type ReactNode, useMemo } from "react";
import type { PermissionIdentifier } from "./types";
import { usePermission } from "./use-permission";

interface PermissionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  mode?: "any" | "all";
  permission?: PermissionIdentifier | null;
  permissions?: PermissionIdentifier[];
}

export function PermissionGuard({
  permission,
  permissions,
  mode = "any",
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } =
    usePermission();

  const hasAccess = useMemo(() => {
    if (permission === null) {
      return true;
    }

    if (permission !== undefined) {
      return hasPermission(permission);
    }

    if (permissions && permissions.length > 0) {
      return mode === "all"
        ? hasAllPermissions(permissions)
        : hasAnyPermission(permissions);
    }

    return true;
  }, [
    permission,
    permissions,
    mode,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  ]);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
