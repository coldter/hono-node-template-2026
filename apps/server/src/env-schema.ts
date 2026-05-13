import { z } from "zod";

const LEADING_DOT_RE = /^\./;

/**
 * Pure environment schema — no side effects. Import {@link env} from
 * `./env` when you need the validated singleton.
 */
export const envSchema = z
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
    DATABASE_URL: z.string().min(1).max(1000),
    DATABASE_TEST_URL: z.string().optional(),
    SKIP_DB: z
      .string()
      .transform((val) => val === "true" || val === "1")
      .optional(),
    CORS_ORIGIN: z
      .string()
      .transform((val) => val.split(",").map((s) => s.trim())),
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

    // Firebase Cloud Messaging
    FCM_PROVIDER: z.enum(["firebase", "console"]).default("console"),
    FIREBASE_SERVICE_ACCOUNT_KEY_BASE64: z.string().optional(),

    VAULT_PROVIDER: z
      .enum(["local", "aws-kms", "gcp-kms", "azure-keyvault"])
      .default("local"),
    VAULT_MASTER_KEY: z.string().length(64).optional(),

    // Required in production via the refine below; optional in dev/test
    // where the in-memory adapter is wired by the bootstrap.
    REDIS_URL: z.url().optional(),

    APP_WILDCARD_HOST: z.string().default("app.localhost"),
    ADMIN_HOST: z.string().default("admin.localhost"),
    FALLBACK_HOST: z.string().default("app.localhost"),
    ALLOW_DEV_TENANT_HEADER: z.enum(["0", "1"]).default("0"),
    // Versioned logo URLs:
    // `https://${BRANDING_HOST}/${organizationId}/logo.${logoVersion}.webp`.
    BRANDING_HOST: z.string().default("branding.localhost"),

    // DNS label tenants publish their `vtok_…` verification token under.
    // The full TXT record is `<label>.<hostname>`.
    CUSTOM_HOST_VERIFICATION_LABEL: z.string().default("_app-verify"),
    // Hostname tenants CNAME their custom hostname to. Must NOT live under
    // the tenant wildcard or the refine below fails.
    CUSTOM_HOST_CNAME_TARGET: z.string().default("tenants.localhost"),
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
  )
  .refine((data) => data.NODE_ENV !== "production" || data.REDIS_URL, {
    message: "REDIS_URL is required when NODE_ENV=production",
    path: ["REDIS_URL"],
  })
  // Host-collision refines (defense in depth). `@repo/tenancy`'s
  // loadHostConfig also throws on these, but failing at env-parse time
  // gives a clearer boot error naming the colliding pair.
  .refine((data) => data.APP_WILDCARD_HOST !== data.ADMIN_HOST, {
    message:
      "APP_WILDCARD_HOST and ADMIN_HOST must differ (both resolved to the same host)",
    path: ["ADMIN_HOST"],
  })
  .refine(
    (data) => {
      const apex = data.APP_WILDCARD_HOST.replace(LEADING_DOT_RE, "");
      if (data.BRANDING_HOST === apex) {
        return false;
      }
      // Reject `*.APP_WILDCARD_HOST` placements (suffix match on `.<apex>`).
      if (data.BRANDING_HOST.endsWith(`.${apex}`)) {
        return false;
      }
      return true;
    },
    {
      message:
        "BRANDING_HOST must not equal APP_WILDCARD_HOST's apex or sit under the tenant wildcard",
      path: ["BRANDING_HOST"],
    }
  )
  .refine(
    (data) => {
      const apex = data.APP_WILDCARD_HOST.replace(LEADING_DOT_RE, "");
      if (data.CUSTOM_HOST_CNAME_TARGET === apex) {
        return false;
      }
      if (data.CUSTOM_HOST_CNAME_TARGET.endsWith(`.${apex}`)) {
        return false;
      }
      if (data.CUSTOM_HOST_CNAME_TARGET === data.ADMIN_HOST) {
        return false;
      }
      return true;
    },
    {
      message:
        "CUSTOM_HOST_CNAME_TARGET must not collide with APP_WILDCARD_HOST (apex or wildcard) or equal ADMIN_HOST",
      path: ["CUSTOM_HOST_CNAME_TARGET"],
    }
  )
  .refine(
    (data) => {
      // FALLBACK_HOST may legitimately equal the wildcard apex (the
      // "tenant-picker at app.example.com" pattern — parse-hostname
      // short-circuits to `{ kind: "fallback" }` before testing the
      // wildcard suffix). What we reject is a wildcard SUBDOMAIN
      // (would shadow a real tenant slot) or an exact ADMIN_HOST match.
      const apex = data.APP_WILDCARD_HOST.replace(LEADING_DOT_RE, "");
      if (data.FALLBACK_HOST === data.ADMIN_HOST) {
        return false;
      }
      if (data.FALLBACK_HOST.endsWith(`.${apex}`)) {
        return false;
      }
      return true;
    },
    {
      message:
        "FALLBACK_HOST must not equal ADMIN_HOST or sit under the APP_WILDCARD_HOST wildcard",
      path: ["FALLBACK_HOST"],
    }
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Describes a single environment variable for tooling (e.g. `scripts/setup-env.ts`)
 * without that tool having to reach into Zod's `_def` internals.
 *
 * - `required: true` + `default: undefined` → operator must supply a value.
 * - `required: false` → optional in dev/test; may still be enforced by a
 *   schema-level `.refine()`.
 * - `default` is the stringified form of the schema default.
 */
export type KeySpec = {
  required: boolean;
  default?: string;
  description?: string;
  group?: string;
};

/**
 * Source of truth for the env-template generator. Keep in lockstep with
 * `envSchema` — the `env-schema.spec.ts` test enforces drift parity.
 */
export const ENV_KEY_SPECS = {
  NODE_ENV: { required: false, default: "development", group: "core" },
  PORT: { required: false, default: "3000", group: "core" },
  LOG_LEVEL: { required: false, default: "info", group: "core" },
  WORK_FLOWS_LOG_LEVEL: { required: false, default: "warn", group: "core" },
  APP_NAME: { required: false, default: "App", group: "brand" },
  COMPANY_NAME: { required: false, default: "Acme Inc.", group: "brand" },
  SUPPORT_EMAIL: {
    required: false,
    default: "support@example.com",
    group: "brand",
  },
  BRAND_PRIMARY_COLOR: {
    required: false,
    default: "#2563eb",
    group: "brand",
  },
  LOGO_TEXT: { required: false, default: "App", group: "brand" },
  APP_URL: {
    required: false,
    default: "http://localhost:3001",
    group: "core",
  },
  ENABLE_DOCS: { required: false, default: "true", group: "core" },
  DATABASE_URL: { required: true, group: "db" },
  DATABASE_TEST_URL: { required: false, group: "db" },
  SKIP_DB: { required: false, group: "db" },
  CORS_ORIGIN: { required: true, group: "core" },
  BASE_PATH: { required: false, default: "", group: "core" },
  SERVER_URL: {
    required: false,
    default: "http://localhost:3100",
    group: "core",
  },
  BETTER_AUTH_SECRET: { required: true, group: "auth" },
  BETTER_AUTH_URL: {
    required: false,
    default: "http://localhost:3000",
    group: "auth",
  },
  HATCHET_ENABLED: { required: false, default: "false", group: "hatchet" },
  HATCHET_CLIENT_TOKEN: { required: false, group: "hatchet" },
  HATCHET_CLIENT_TLS_STRATEGY: {
    required: false,
    default: "none",
    group: "hatchet",
  },
  HATCHET_CLIENT_HOST_PORT: {
    required: false,
    default: "localhost:7077",
    group: "hatchet",
  },
  HATCHET_WORKER_SLOTS: { required: false, default: "10", group: "hatchet" },
  HATCHET_THROW_ON_ERROR: {
    required: false,
    default: "false",
    group: "hatchet",
  },
  OTEL_ENABLED: { required: false, default: "false", group: "otel" },
  OTEL_TRACES_ENDPOINT: { required: false, group: "otel" },
  OTEL_METRICS_ENDPOINT: { required: false, group: "otel" },
  OTEL_LOGS_ENDPOINT: { required: false, group: "otel" },
  OTEL_EXPORTER_OTLP_HEADERS: { required: false, group: "otel" },
  EMAIL_PROVIDER: { required: false, default: "console", group: "email" },
  EMAIL_FROM: {
    required: false,
    default: "noreply@example.com",
    group: "email",
  },
  EMAIL_FROM_NAME: { required: false, default: "App", group: "email" },
  SMTP_HOST: { required: false, group: "email" },
  SMTP_PORT: { required: false, group: "email" },
  SMTP_USER: { required: false, group: "email" },
  SMTP_PASS: { required: false, group: "email" },
  SMTP_SECURE: { required: false, default: "false", group: "email" },
  FCM_PROVIDER: { required: false, default: "console", group: "fcm" },
  FIREBASE_SERVICE_ACCOUNT_KEY_BASE64: { required: false, group: "fcm" },
  VAULT_PROVIDER: { required: false, default: "local", group: "vault" },
  VAULT_MASTER_KEY: { required: false, group: "vault" },
  REDIS_URL: { required: false, group: "redis" },
  APP_WILDCARD_HOST: {
    required: false,
    default: "app.localhost",
    group: "host",
  },
  ADMIN_HOST: { required: false, default: "admin.localhost", group: "host" },
  FALLBACK_HOST: {
    required: false,
    default: "app.localhost",
    group: "host",
  },
  ALLOW_DEV_TENANT_HEADER: { required: false, default: "0", group: "host" },
  BRANDING_HOST: {
    required: false,
    default: "branding.localhost",
    group: "host",
  },
  CUSTOM_HOST_VERIFICATION_LABEL: {
    required: false,
    default: "_app-verify",
    group: "host",
  },
  CUSTOM_HOST_CNAME_TARGET: {
    required: false,
    default: "tenants.localhost",
    group: "host",
  },
} as const satisfies Record<string, KeySpec>;
