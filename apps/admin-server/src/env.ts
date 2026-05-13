import "dotenv/config";
import { z } from "zod";
import { type Env, envSchema } from "./env-schema";

export type { Env };
export { envSchema };

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.NODE_ENV === "test"
  ) {
    console.warn("[admin-server] Skipping environment validation");
  } else {
    console.error("[admin-server] Environment validation failed");
    console.error(
      "[admin-server] Invalid environment variables:",
      z.treeifyError(parsedEnv.error).errors
    );
    console.error(parsedEnv.error);
    process.exit(1);
  }
}

// boundary: process.env contains validated env when parse succeeds; on
// SKIP_ENV_VALIDATION/test fallthrough we accept the raw env shape so the
// process can boot for tests that don't need every key.
export const env = parsedEnv.success
  ? parsedEnv.data
  : (process.env as unknown as Env);
