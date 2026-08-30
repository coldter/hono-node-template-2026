import "dotenv/config";
import { z } from "zod";

/**
 * Parses OTLP exporter headers from the OTEL-standard comma-separated
 * `key=value,key2=value2` format, falling back to a JSON object for
 * backward compatibility. Throws on malformed input.
 */
export function parseOtlpHeaders(value: string): Record<string, string> {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("JSON form must be an object of string values");
    }
    const headers: Record<string, string> = {};
    for (const [key, headerValue] of Object.entries(parsed)) {
      if (typeof headerValue !== "string") {
        throw new Error(`header "${key}" must be a string`);
      }
      headers[key] = headerValue;
    }
    return headers;
  }

  const headers: Record<string, string> = {};
  for (const pair of trimmed.split(",")) {
    // Split on the first "=" only: header values like "Bearer a=b" are legal.
    const separatorIndex = pair.indexOf("=");
    const key = separatorIndex > 0 ? pair.slice(0, separatorIndex).trim() : "";
    const headerValue = pair.slice(separatorIndex + 1).trim();
    if (!(key && headerValue)) {
      throw new Error(`malformed header pair "${pair.trim()}"`);
    }
    headers[key] = headerValue;
  }
  return headers;
}

const envSchema = z
  .object({
    APP_NAME: z.string().default("App"),
    APP_URL: z.url().default("http://localhost:3001"),
    BASE_PATH: z.string().default(""),
    BETTER_AUTH_SECRET: z.string(),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    BRAND_PRIMARY_COLOR: z.string().default("#2563eb"),
    COMPANY_NAME: z.string().default("Acme Inc."),
    CORS_ORIGIN: z
      .string()
      .transform((val) => val.split(",").map((s) => s.trim())),
    DATABASE_TEST_URL: z.string().optional(),
    DATABASE_URL: z.string().min(1).max(1000),
    DB_POOL_MAX: z.coerce.number().default(10),
    EMAIL_FROM: z.email().default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().default("App"),

    EMAIL_PROVIDER: z.enum(["nodemailer", "console"]).default("console"),
    ENABLE_DOCS: z
      .string()
      .default("true")
      .transform((val) => val === "true"),
    ENABLE_DOCS_IN_PRODUCTION: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    ENABLE_SIGNUP: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),

    FCM_PROVIDER: z.enum(["firebase", "console"]).default("console"),
    FIREBASE_SERVICE_ACCOUNT_KEY_BASE64: z.string().optional(),
    HATCHET_CLIENT_HOST_PORT: z.string().default("localhost:7077"),
    HATCHET_CLIENT_TLS_STRATEGY: z
      .enum(["none", "tls", "mtls"])
      .default("none"),
    HATCHET_CLIENT_TOKEN: z.string().optional(),

    HATCHET_ENABLED: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    HATCHET_THROW_ON_ERROR: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    HATCHET_WORKER_SLOTS: z.coerce.number().default(10),
    // Winston npm levels only; pino-style values (fatal/trace/silent) would
    // silently suppress all output because winston treats them as unknown.
    LOG_LEVEL: z
      .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
      .default("info"),
    LOGO_TEXT: z.string().default("App"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    OTEL_ENABLED: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),

    OTEL_EXPORTER_OTLP_HEADERS: z
      .string()
      .optional()
      .transform((val, ctx) => {
        if (!val || val.trim() === "") {
          return;
        }
        try {
          return parseOtlpHeaders(val);
        } catch (error) {
          ctx.addIssue({
            code: "custom",
            message: `OTEL_EXPORTER_OTLP_HEADERS must be comma-separated key=value pairs (or a JSON object): ${error instanceof Error ? error.message : String(error)}`,
          });
          return z.NEVER;
        }
      }),
    OTEL_LOGS_ENDPOINT: z.url().optional(),
    OTEL_METRICS_ENDPOINT: z.url().optional(),

    OTEL_TRACES_ENDPOINT: z.url().optional(),
    PORT: z.coerce.number().default(3000),
    REDIS_URL: z.string().optional(),
    SERVER_URL: z.string().default("http://localhost:3100"),
    SKIP_DB: z
      .string()
      .transform((val) => val === "true" || val === "1")
      .optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_SECURE: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    SMTP_USER: z.string().optional(),
    SUPPORT_EMAIL: z.email().default("support@example.com"),
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    VAULT_MASTER_KEY: z.string().length(64).optional(),

    VAULT_PROVIDER: z
      .enum(["local", "aws-kms", "gcp-kms", "azure-keyvault"])
      .default("local"),
    WORK_FLOWS_LOG_LEVEL: z
      .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
      .default("warn"),
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
