/**
 * Bootstrap a first global-admin row so an operator can sign in to the
 * admin perimeter before the invitation flow is mounted.
 *
 * Why a seed and not the enroll endpoint: the redeem endpoint can only run
 * after a `pending` row exists, which itself requires an authenticated
 * operator. The very first operator therefore cannot be created via the
 * invite/redeem cycle — they have to be seeded with an already-bound row.
 *
 * Production guard: the seed refuses to run when `NODE_ENV === "production"`
 * unless the caller opts in by setting `SEED_OPERATOR_ALLOW_PRODUCTION=1`.
 * This makes the script safe to ship in the image while remaining usable as
 * a recovery tool when an explicit operator boots it.
 */

import type { OperatorSubRole } from "@repo/authorization";
import { generateIdForModel } from "@repo/db";
import { accounts, globalAdmins, users } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { env } from "@/env";
import { hashPassword } from "@/modules/auth/helpers/argon2id";

const seedEnvSchema = z.object({
  SEED_OPERATOR_EMAIL: z.string().email(),
  SEED_OPERATOR_PASSWORD: z.string().min(12),
  SEED_OPERATOR_NAME: z.string().min(1).default("Platform Admin"),
  SEED_OPERATOR_SUB_ROLE: z
    .enum(["platform_admin", "support", "read_only"])
    .default("platform_admin"),
});

type SeedConfig = z.infer<typeof seedEnvSchema>;

export type OperatorSeedResult = Readonly<
  | { status: "skipped"; reason: "production" | "already_exists" }
  | {
      status: "created";
      userId: string;
      globalAdminId: string;
      email: string;
      subRole: OperatorSubRole;
    }
>;

const ALLOW_PROD_FLAG = "SEED_OPERATOR_ALLOW_PRODUCTION";

function isProductionAllowed(): boolean {
  const v = process.env[ALLOW_PROD_FLAG];
  return v === "1" || v === "true";
}

function readSeedConfig(): SeedConfig {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid operator seed env: ${issues}`);
  }
  return parsed.data;
}

export const operatorSeed = async (): Promise<OperatorSeedResult> => {
  if (env.NODE_ENV === "production" && !isProductionAllowed()) {
    console.warn(
      `[seed:operator] refusing to run in production (set ${ALLOW_PROD_FLAG}=1 to override)`
    );
    return { status: "skipped", reason: "production" };
  }

  const config = readSeedConfig();

  // Idempotency: a row with this email already pins the operator; do not
  // overwrite credentials or sub-role on rerun — that would surprise an
  // operator who rotated their password.
  const existing = await db
    .select({ id: globalAdmins.id })
    .from(globalAdmins)
    .where(eq(globalAdmins.email, config.SEED_OPERATOR_EMAIL))
    .limit(1);
  if (existing[0]) {
    console.info(
      `[seed:operator] operator ${config.SEED_OPERATOR_EMAIL} already exists, skipping`
    );
    return { status: "skipped", reason: "already_exists" };
  }

  const passwordHash = await hashPassword(config.SEED_OPERATOR_PASSWORD);
  const userId = generateIdForModel("user");
  const accountId = generateIdForModel("account");
  const globalAdminId = generateIdForModel("globalAdmin");

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: config.SEED_OPERATOR_EMAIL,
      name: config.SEED_OPERATOR_NAME,
      emailVerified: true,
    });
    await tx.insert(accounts).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
    await tx.insert(globalAdmins).values({
      id: globalAdminId,
      userId,
      email: config.SEED_OPERATOR_EMAIL,
      subRole: config.SEED_OPERATOR_SUB_ROLE,
      boundAt: new Date(),
    });
  });

  console.info(
    `[seed:operator] created operator ${config.SEED_OPERATOR_EMAIL} (${config.SEED_OPERATOR_SUB_ROLE})`
  );

  return {
    status: "created",
    userId,
    globalAdminId,
    email: config.SEED_OPERATOR_EMAIL,
    subRole: config.SEED_OPERATOR_SUB_ROLE,
  };
};
