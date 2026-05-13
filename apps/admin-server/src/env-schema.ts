import { z } from "zod";

/**
 * Pure environment schema for the operator-facing admin-server. No side
 * effects. Mirrors `apps/server/src/env-schema.ts`'s split: this module
 * exports only the schema; the parse-on-import singleton lives in `./env`.
 *
 * The admin-server is tenant-agnostic: it owns no `APP_WILDCARD_HOST`,
 * `FALLBACK_HOST`, `CUSTOM_HOST_*` or tenant-resolution config. It pins a
 * single host (`ADMIN_HOST`) and a separate BA secret so a leaked tenant
 * secret cannot mint operator sessions and vice versa.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3100),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_NAME: z.string().default("App Admin"),
  BASE_PATH: z.string().default(""),

  DATABASE_URL: z.string().min(1).max(1000),
  DATABASE_TEST_URL: z.string().optional(),
  SKIP_DB: z
    .string()
    .transform((val) => val === "true" || val === "1")
    .optional(),

  // Single pinned host the admin-server accepts. The host-header guard
  // (B1.2) rejects every other Host. No wildcard, no fallback.
  ADMIN_HOST: z.string().default("admin.localhost"),

  // Origin(s) the admin UI is served from. Restricted: never includes the
  // tenant wildcard origins.
  ADMIN_CORS_ORIGIN: z
    .string()
    .default("http://localhost:3201")
    .transform((val) => val.split(",").map((s) => s.trim())),

  // Separate BA secret from the tenant server's `BETTER_AUTH_SECRET`.
  // Distinct secrets so a leak in one perimeter cannot mint sessions in
  // the other.
  OPERATOR_BETTER_AUTH_SECRET: z.string(),
  OPERATOR_BETTER_AUTH_URL: z.url().default("http://localhost:3100"),
});

/**
 * @public
 */
export type Env = z.infer<typeof envSchema>;
