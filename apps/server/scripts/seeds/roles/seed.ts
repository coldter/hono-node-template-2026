import chalk from "chalk";

import { db } from "@/db";
import { roles } from "@/db/schema";
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
    permissions: ["*"], // Full access
  },
  {
    ...SYSTEM_ROLES.USER,
    permissions: [] as PermissionKey[],
  },
];

/**
 * Check if roles table has any records
 */
const isRolesSeeded = async (): Promise<boolean> => {
  const existingRoles = await db.query.roles.findFirst();
  return existingRoles !== undefined;
};

/**
 * Seed system roles to the database
 *
 * Uses upsert to ensure roles exist without duplicating them.
 * Does not override permissions for existing roles (they might be customized).
 */
export const rolesSeed = async () => {
  console.info("Seeding system roles...");

  for (const role of systemRoles) {
    // Check if role exists
    const existingRole = await db.query.roles.findFirst({
      where: { slug: { eq: role.slug } },
    });

    if (existingRole) {
      console.info(`  Role ${chalk.cyan(role.slug)} already exists - skipping`);
      continue;
    }

    // Insert new role
    await db.insert(roles).values({
      name: role.name,
      slug: role.slug,
      description: role.description,
      permissions: role.permissions,
    });

    console.info(`  Created role ${chalk.green(role.slug)}`);
  }

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
