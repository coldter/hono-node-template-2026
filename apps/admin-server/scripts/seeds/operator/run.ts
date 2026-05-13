import { operatorSeed } from "./seed";

operatorSeed()
  .catch((error) => {
    console.error("Operator seed failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
