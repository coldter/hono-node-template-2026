import { createAccountId, createUserId } from "@repo/db";
import { accounts, users } from "@repo/db/schema";
import { seedTenant } from "@repo/test-harness";
import chalk from "chalk";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { env } from "@/env";
import { hashPassword } from "@/modules/auth/helpers/argon2id";

const DEV_TENANT_SLUG = "acme";
const DEV_USER_EMAIL = "dev@example.com";
const DEV_USER_NAME = "Dev User";
const DEV_USER_PASSWORD = "dev";

/**
 * Idempotent local-dev seed: tenant "acme" plus a credential-loginable user.
 * `SEED_CUSTOM_HOST=1` additionally seeds `app.acme.localhost` as an active custom hostname.
 */
export const devSeed = async () => {
  if (env.NODE_ENV === "production") {
    console.error("Not allowed in production.");
    return;
  }

  const withCustomHost =
    process.env.SEED_CUSTOM_HOST === "1" ? "app.acme.localhost" : undefined;

  const tenant = await seedTenant({
    db,
    slug: DEV_TENANT_SLUG,
    withCustomHost,
  });

  console.info(
    `\nSeeded tenant ${chalk.greenBright.bold(tenant.slug)} (${chalk.cyan(
      tenant.organizationId
    )}).`
  );
  if (tenant.host) {
    console.info(`  Custom host: ${chalk.cyan(tenant.host)}`);
  }

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEV_USER_EMAIL))
    .limit(1);

  if (existingUser.length > 0) {
    console.warn(
      `  Dev user ${chalk.cyan(DEV_USER_EMAIL)} already exists - skipping`
    );
    return;
  }

  const userId = createUserId();
  const hashedPassword = await hashPassword(DEV_USER_PASSWORD);

  const [user] = await db
    .insert(users)
    .values({
      id: userId,
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      emailVerified: true,
      status: "active",
      roleSlugs: [],
      failedLoginAttempts: 0,
    })
    .returning();

  if (!user) {
    console.error("Failed to create dev user");
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
    `  Created dev user ${chalk.greenBright.bold(user.email)} (password: ${chalk.greenBright.bold(DEV_USER_PASSWORD)}).\n`
  );
};
