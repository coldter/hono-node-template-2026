import { auditLogsSeed } from "./seed";

auditLogsSeed()
  .catch((error) => {
    console.error("Audit logs seeding failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
