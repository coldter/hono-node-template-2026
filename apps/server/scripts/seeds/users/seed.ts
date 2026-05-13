import { createAccountId, createUserId } from "@repo/db";
import { accounts, users } from "@repo/db/schema";
import chalk from "chalk";

import { db } from "@/db";
import { env } from "@/env";
import { hashPassword } from "@/modules/auth/helpers/argon2id";
import { SYSTEM_ROLES } from "@/modules/auth/roles";
import { defaultAdminUser } from "../fixtures";
import { isUserSeeded } from "../utils";

export const userSeed = async () => {
  if (env.NODE_ENV !== "development") {
    console.error(
      "userSeed creates a hardcoded admin credential and is dev-only. Refusing to run."
    );
    return;
  }

  if (process.env.SEED_DEV_FIXTURES !== "1") {
    console.error(
      "userSeed creates the committed `admin@example.com` / `admin123456` credential. Set SEED_DEV_FIXTURES=1 to opt in."
    );
    return;
  }

  if (await isUserSeeded()) {
    console.warn("Users table is not empty - skipping seed");
    return;
  }

  const userId = createUserId();
  const hashedPassword = await hashPassword(defaultAdminUser.password);

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
