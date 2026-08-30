import { roles } from "@repo/db/schema";
import { getLegacyPermissionKeysForRole } from "@repo/shared/authorization";
import chalk from "chalk";

import { db } from "@/db";
import { type PermissionKey, SYSTEM_ROLES } from "@/modules/auth/roles";

/**
 * System roles to seed - these are guaranteed to exist
 */
const systemRoles: Array<{
  slug: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  {
    ...SYSTEM_ROLES.ADMIN,
    permissions: getLegacyPermissionKeysForRole("admin"),
  },
  {
    ...SYSTEM_ROLES.USER,
    permissions: getLegacyPermissionKeysForRole("user") as PermissionKey[],
  },
];

const isRolesSeeded = async (): Promise<boolean> => {
  const existingRoles = await db.query.roles.findFirst();
  return existingRoles !== undefined;
};

/**
 * Uses upsert to ensure roles exist without duplicating them.
 * Does not override permissions for existing roles (they might be customized).
 */
export const rolesSeed = async () => {
  console.info("Seeding system roles...");

  await Promise.all(
    systemRoles.map(async (role) => {
      const existingRole = await db.query.roles.findFirst({
        where: { slug: { eq: role.slug } },
      });

      if (existingRole) {
        console.info(
          `  Role ${chalk.cyan(role.slug)} already exists - skipping`
        );
        return;
      }

      await db.insert(roles).values({
        description: role.description,
        name: role.name,
        permissions: role.permissions,
        slug: role.slug,
      });

      console.info(`  Created role ${chalk.green(role.slug)}`);
    })
  );

  console.info(chalk.greenBright("System roles seeded successfully.\n"));
};

/**
 * Seed system roles - can be run independently
 */
export const runRolesSeed = async () => {
  if (await isRolesSeeded()) {
    console.warn("Roles table is not empty - updating system roles only");
  }

  await rolesSeed();
};
