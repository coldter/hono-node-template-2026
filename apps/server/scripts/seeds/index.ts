import { auditLogsSeed } from "./audit-logs/seed";
import { rolesSeed } from "./roles/seed";
import { userSeed } from "./users/seed";

const seed = async () => {
  console.info("Starting database seeding...\n");

  await rolesSeed();
  await userSeed();
  await auditLogsSeed();

  console.info("\nDatabase seeding complete.");
};

seed()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
