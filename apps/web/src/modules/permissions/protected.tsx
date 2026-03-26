import type { ReactNode } from "react";

import { PermissionDenied } from "./permission-denied";
import { PermissionGuard } from "./permission-guard";
import type { PermissionIdentifier } from "./types";
import { getPermissionKey } from "./types";

interface ProtectedProps {
  /** Content to render when permission is granted */
  children: ReactNode;
  /** Optional custom message for the access denied page */
  message?: string;
  /** Permission required to view the content */
  permission: PermissionIdentifier;
  /** Whether to show the logout button on the access denied page */
  showLogoutButton?: boolean;
  /** Optional custom title for the access denied page */
  title?: string;
}

/**
 * A convenient wrapper around PermissionGuard that automatically
 * renders the PermissionDenied component as a fallback.
 *
 * @example
 * ```tsx
 * <Protected permission={PERMISSIONS.USERS.VIEW}>
 *   <UsersList />
 * </Protected>
 * ```
 */
export function Protected({
  permission,
  title,
  message,
  showLogoutButton,
  children,
}: ProtectedProps) {
  return (
    <PermissionGuard
      fallback={
        <PermissionDenied
          message={message}
          requiredPermission={getPermissionKey(permission)}
          showLogoutButton={showLogoutButton}
          title={title}
        />
      }
      permission={permission}
    >
      {children}
    </PermissionGuard>
  );
}
