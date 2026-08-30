import { accounts, users } from "@repo/db/schema";
import chalk from "chalk";

import { db } from "@/db";
import { env } from "@/env";
import { hashPassword } from "@/modules/auth/helpers/argon2id";
import { SYSTEM_ROLES } from "@/modules/auth/roles";
import { createAccountId, createUserId } from "../../../src/lib/ids";
import { defaultAdminUser } from "../fixtures";
import { isUserSeeded } from "../utils";

export const userSeed = async () => {
  if (env.NODE_ENV === "production") {
    console.error("Not allowed in production.");
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
      email: defaultAdminUser.email,
      emailVerified: true,
      failedLoginAttempts: 0,
      id: userId,
      name: defaultAdminUser.name,
      roleSlugs: [SYSTEM_ROLES.ADMIN.slug],
      status: "active",
    })
    .returning();

  if (!user) {
    console.error("Failed to create admin user");
    return;
  }

  await db.insert(accounts).values({
    accountId: userId,
    id: createAccountId(),
    password: hashedPassword,
    providerId: "credential",
    userId,
  });

  console.info(
    `\nCreated admin user with email ${chalk.greenBright.bold(user.email)} and password ${chalk.greenBright.bold(defaultAdminUser.password)}.\n`
  );
  console.info(`  Role: ${chalk.cyan(SYSTEM_ROLES.ADMIN.slug)}`);
  console.info(`  Status: ${chalk.green("active")}\n`);
};
