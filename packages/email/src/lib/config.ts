import { BRAND_DEFAULTS, getBrandConfig } from "@repo/shared/brand";
import { z } from "zod";

const brand = getBrandConfig(process.env);

function parseBooleanString(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", ""].includes(normalized)) {
    return false;
  }

  return;
}

function parseSmtpPort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return;
  }

  return parsed;
}

export interface SmtpOptions {
  auth: {
    user: string;
    pass: string;
  };
  host: string;
  port: number;
  secure: boolean;
}

export interface EmailFrom {
  default: string;
  name: string;
}

/**
 * Discriminated transport choice — the single source of truth for which
 * adapter `createTransport` should pick. Adding a new transport here forces
 * a new case in `createTransport`'s switch.
 */
export type EmailConfig =
  | { kind: "console"; from: EmailFrom }
  | { kind: "smtp"; from: EmailFrom; smtp: SmtpOptions };

const smtpSchema = z.object({
  host: z.string(),
  port: z.coerce.number().default(587),
  secure: z.boolean().default(false),
  auth: z.object({
    user: z.string(),
    pass: z.string(),
  }),
});

const fromSchema = z.object({
  default: z.email().default("noreply@example.com"),
  name: z.string().default(BRAND_DEFAULTS.appName),
});

type ProviderHint = "nodemailer" | "console" | undefined;

const providerSchema = z.enum(["nodemailer", "console"]).optional();

function resolveSmtp(): SmtpOptions | undefined {
  const smtpPort = parseSmtpPort(process.env.SMTP_PORT);
  const secureFromEnv = parseBooleanString(process.env.SMTP_SECURE);
  const isMailpitHost =
    process.env.SMTP_HOST?.trim().toLowerCase() === "mailpit";
  const usesSubmissionPortWithImplicitTls =
    smtpPort === 587 && secureFromEnv === true;

  const resolvedSecure =
    secureFromEnv ?? (smtpPort === undefined ? false : smtpPort === 465);

  if (isMailpitHost && resolvedSecure) {
    console.warn(
      "SMTP_SECURE=true is incompatible with Mailpit SMTP. Forcing secure=false."
    );
  }
  if (usesSubmissionPortWithImplicitTls) {
    console.warn(
      "SMTP_SECURE=true with SMTP_PORT=587 may fail for STARTTLS SMTP servers. Prefer SMTP_SECURE=false."
    );
  }

  if (!process.env.SMTP_HOST) {
    return;
  }

  const parsed = smtpSchema.safeParse({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: isMailpitHost ? false : resolvedSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  if (!parsed.success) {
    return;
  }
  return parsed.data;
}

function resolveFrom(): EmailFrom {
  const parsed = fromSchema.safeParse({
    default: process.env.EMAIL_FROM,
    name: process.env.EMAIL_FROM_NAME,
  });
  if (parsed.success) {
    return parsed.data;
  }
  return {
    default: "noreply@example.com",
    name: `${brand.appName} (Dev)`,
  };
}

function devFallback(): EmailConfig {
  return {
    kind: "console",
    from: {
      default: "noreply@example.com",
      name: `${brand.appName} (Dev)`,
    },
  };
}

export function getEmailConfig(): EmailConfig {
  const providerParsed = providerSchema.safeParse(process.env.EMAIL_PROVIDER);
  if (!providerParsed.success) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[error] Invalid email environment variables:",
        z.treeifyError(providerParsed.error)
      );
      throw new Error("Invalid email configuration");
    }
    return devFallback();
  }

  const providerHint: ProviderHint = providerParsed.data;
  const smtp = resolveSmtp();
  const from = resolveFrom();

  if (providerHint === "console") {
    return { kind: "console", from };
  }

  // Default / explicit nodemailer: require SMTP options.
  if (smtp) {
    return { kind: "smtp", from, smtp };
  }

  if (providerHint === "nodemailer" && process.env.NODE_ENV === "production") {
    console.error(
      "[error] EMAIL_PROVIDER=nodemailer but SMTP options are missing/invalid."
    );
    throw new Error("Invalid email configuration");
  }

  return { kind: "console", from };
}
