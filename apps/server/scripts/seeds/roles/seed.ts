import { roles } from "@repo/db/schema";
import chalk from "chalk";

import { db } from "@/db";
import { SYSTEM_ROLES } from "@/modules/auth/roles";

const systemRoles = [SYSTEM_ROLES.ADMIN, SYSTEM_ROLES.USER];

const isRolesSeeded = async (): Promise<boolean> => {
  const existingRoles = await db.query.roles.findFirst();
  return existingRoles !== undefined;
};

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
        slug: role.slug,
      });

      console.info(`  Created role ${chalk.green(role.slug)}`);
    })
  );

  console.info(chalk.greenBright("System roles seeded successfully.\n"));
};

export const runRolesSeed = async () => {
  if (await isRolesSeeded()) {
    console.warn("Roles table is not empty - updating system roles only");
  }

  await rolesSeed();
};
