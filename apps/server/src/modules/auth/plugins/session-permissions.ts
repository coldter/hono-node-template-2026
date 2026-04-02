import type { PermissionKey } from "@repo/shared/permissions";
import { db } from "@/db";
import { patchedCustomSession } from "./patched-custom-session";

export type SessionUserWithPermissions = {
  permissions: PermissionKey[];
};

/**
 * Fetches and aggregates all permissions from user's roles
 * Returns deduplicated array of permission keys
 */
async function getPermissionsForUser(
  roleSlugs: string[]
): Promise<PermissionKey[]> {
  if (!roleSlugs.length) {
    return [];
  }

  const userRoles = await db.query.roles.findMany({
    where: { slug: { in: roleSlugs } },
    columns: { permissions: true },
  });

  const permissionSet = new Set<PermissionKey>();

  for (const role of userRoles) {
    for (const permission of role.permissions) {
      permissionSet.add(permission);
    }
  }

  return Array.from(permissionSet);
}

export const enhancedSessionPlugin = () =>
  patchedCustomSession(async ({ user, session }) => {
    const roleSlugs = (user as { roleSlugs?: string[] }).roleSlugs ?? [];
    const permissions = await getPermissionsForUser(roleSlugs);

    return {
      user: {
        ...user,
        permissions,
      },
      session,
    };
  });
