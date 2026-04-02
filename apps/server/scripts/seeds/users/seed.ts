import { accounts, users } from "@repo/db/schema";
import chalk from "chalk";

import { db } from "@/db";
import { env } from "@/env";
import { hashPassword } from "@/modules/auth/helpers/argon2id";
import { SYSTEM_ROLES } from "@/modules/auth/roles";
import { createAccountId, createUserId } from "../../../src/lib/ids";
import { defaultAdminUser } from "../fixtures";
import { isUserSeeded } from "../utils";

/**
 * Seed an admin user to access app first time
 *
 * Creates a user with the admin role assigned.
 */
export const userSeed = async () => {
  // Skip seeding in production
  if (env.NODE_ENV === "production") {
    console.error("Not allowed in production.");
    return;
  }

  // Skip if records already exist
  if (await isUserSeeded()) {
    console.warn("Users table is not empty - skipping seed");
    return;
  }

  const userId = createUserId();
  const hashedPassword = await hashPassword(defaultAdminUser.password);

  // Insert user with admin role and active status
  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      email: defaultAdminUser.email,
      name: defaultAdminUser.name,
      emailVerified: true,
      status: "active",
      roleSlugs: [SYSTEM_ROLES.ADMIN.slug],
      failedLoginAttempts: 0,
    })
    .returning();

  if (!user) {
    console.error("Failed to create admin user");
    return;
  }

  // Insert credential account for password-based login
  await db.insert(accounts).values({
    id: createAccountId(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashedPassword,
  });

  console.info(
    `\nCreated admin user with email ${chalk.greenBright.bold(user.email)} and password ${chalk.greenBright.bold(defaultAdminUser.password)}.\n`
  );
  console.info(`  Role: ${chalk.cyan(SYSTEM_ROLES.ADMIN.slug)}`);
  console.info(`  Status: ${chalk.green("active")}\n`);
};
