import { devSeed } from "./seed";

devSeed()
  .catch((error) => {
    console.error("Dev seeding failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
