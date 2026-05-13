/**
 * Two-tier seed entrypoint.
 *
 * - `bootstrapSeed` runs in any environment and creates ONLY the rows the
 *   server cannot boot without (system roles). It must never insert
 *   credentialed users.
 * - `devSeed` (acme tenant + dev user) and the `defaultAdminUser` fixture
 *   are gated behind `NODE_ENV === "development"` AND an explicit
 *   `SEED_DEV_FIXTURES=1` opt-in. This prevents an accidental
 *   `bun run db:seed` in production from creating the hardcoded
 *   `admin@example.com / admin123456` credential committed to the repo.
 *
 * Mirrors the `SEED_OPERATOR_ALLOW_PRODUCTION` pattern: explicit opt-in
 * for credential-bearing seeds, never implicit.
 */
import { env } from "@/env";
import { auditLogsSeed } from "./audit-logs/seed";
import { devSeed } from "./dev/seed";
import { rolesSeed } from "./roles/seed";
import { userSeed } from "./users/seed";

const isDevFixturesOptIn = () =>
  env.NODE_ENV === "development" && process.env.SEED_DEV_FIXTURES === "1";

const seed = async () => {
  console.info("Starting database seeding...\n");

  await rolesSeed();

  if (isDevFixturesOptIn()) {
    console.info(
      "SEED_DEV_FIXTURES=1 detected - running dev fixtures (admin + dev user + acme tenant + audit logs)."
    );
    await userSeed();
    await auditLogsSeed();
    await devSeed();
  } else {
    console.info(
      "Skipping dev fixtures. Set NODE_ENV=development and SEED_DEV_FIXTURES=1 to seed dev users / tenants."
    );
  }

  console.info("\nDatabase seeding complete.");
};

seed()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
