import "dotenv/config";
import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    WORK_FLOWS_LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("warn"),
    APP_NAME: z.string().default("App"),
    COMPANY_NAME: z.string().default("Acme Inc."),
    SUPPORT_EMAIL: z.email().default("support@example.com"),
    BRAND_PRIMARY_COLOR: z.string().default("#2563eb"),
    LOGO_TEXT: z.string().default("App"),
    APP_URL: z.url().default("http://localhost:3001"),
    ENABLE_DOCS: z
      .string()
      .default("true")
      .transform((val) => val === "true"),
    ENABLE_DOCS_IN_PRODUCTION: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    DATABASE_URL: z.string().min(1).max(1000),
    DATABASE_TEST_URL: z.string().optional(),
    SKIP_DB: z
      .string()
      .transform((val) => val === "true" || val === "1")
      .optional(),
    CORS_ORIGIN: z
      .string()
      .transform((val) => val.split(",").map((s) => s.trim())),
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    REDIS_URL: z.string().optional(),
    ENABLE_SIGNUP: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    BASE_PATH: z.string().default(""),
    SERVER_URL: z.string().default("http://localhost:3100"),
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),

    HATCHET_ENABLED: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    HATCHET_CLIENT_TOKEN: z.string().optional(),
    HATCHET_CLIENT_TLS_STRATEGY: z
      .enum(["none", "tls", "mtls"])
      .default("none"),
    HATCHET_CLIENT_HOST_PORT: z.string().default("localhost:7077"),
    HATCHET_WORKER_SLOTS: z.coerce.number().default(10),
    HATCHET_THROW_ON_ERROR: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),

    OTEL_ENABLED: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),

    OTEL_TRACES_ENDPOINT: z.url().optional(),
    OTEL_METRICS_ENDPOINT: z.url().optional(),
    OTEL_LOGS_ENDPOINT: z.url().optional(),

    OTEL_EXPORTER_OTLP_HEADERS: z
      .string()
      .optional()
      .transform((val) => (val ? JSON.parse(val) : undefined)),

    EMAIL_PROVIDER: z.enum(["nodemailer", "console"]).default("console"),
    EMAIL_FROM: z.email().default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().default("App"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),

    FCM_PROVIDER: z.enum(["firebase", "console"]).default("console"),
    FIREBASE_SERVICE_ACCOUNT_KEY_BASE64: z.string().optional(),

    VAULT_PROVIDER: z
      .enum(["local", "aws-kms", "gcp-kms", "azure-keyvault"])
      .default("local"),
    VAULT_MASTER_KEY: z.string().length(64).optional(),
  })
  .refine((data) => !data.HATCHET_ENABLED || data.HATCHET_CLIENT_TOKEN, {
    message: "HATCHET_CLIENT_TOKEN is required when HATCHET_ENABLED=true",
    path: ["HATCHET_CLIENT_TOKEN"],
  })
  .refine((data) => data.VAULT_PROVIDER !== "local" || data.VAULT_MASTER_KEY, {
    message: "VAULT_MASTER_KEY is required when VAULT_PROVIDER=local",
    path: ["VAULT_MASTER_KEY"],
  })
  .refine(
    (data) =>
      data.FCM_PROVIDER !== "firebase" ||
      data.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
    {
      message:
        "FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 is required when FCM_PROVIDER=firebase",
      path: ["FIREBASE_SERVICE_ACCOUNT_KEY_BASE64"],
    }
  );

export type Env = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  if (
    process.env.SKIP_ENV_VALIDATION === "true" ||
    process.env.SKIP_ENV_VALIDATION === "1" ||
    process.env.NODE_ENV === "test"
  ) {
    console.warn("[warn] Skipping environment validation");
  } else {
    console.error("[error] Environment validation failed");
    console.error(
      "[error] Invalid environment variables:",
      z.treeifyError(parsedEnv.error).errors
    );
    console.error(parsedEnv.error);
    process.exit(1);
  }
}

export const env = parsedEnv.success
  ? parsedEnv.data
  : (process.env as unknown as Env);
