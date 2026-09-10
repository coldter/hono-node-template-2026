import { BRAND_DEFAULTS, getBrandConfig } from "@repo/shared/brand";
import { z } from "zod";

const brand = getBrandConfig(process.env);

function parseBooleanString(
  name: string,
  value: string | undefined
): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Invalid ${name}: "${value}". Expected one of true, false, 1, 0, yes, no, on, off.`
  );
}

function parseSmtpPort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(
      `Invalid SMTP_PORT: "${value}". Expected an integer between 1 and 65535.`
    );
  }

  return parsed;
}

const emailConfigSchema = z.object({
  from: z.object({
    default: z.email().default("noreply@example.com"),
    name: z.string().default(BRAND_DEFAULTS.appName),
  }),
  provider: z.enum(["nodemailer", "console"]).optional(),
  smtp: z
    .object({
      auth: z.object({
        pass: z.string(),
        user: z.string(),
      }),
      host: z.string(),
      port: z.coerce.number().default(587),
      secure: z.boolean().default(false),
    })
    .optional(),
});

export type EmailConfig = z.infer<typeof emailConfigSchema>;

export function getEmailConfig(): EmailConfig {
  const smtpPort = parseSmtpPort(process.env.SMTP_PORT);
  const secureFromEnv = parseBooleanString(
    "SMTP_SECURE",
    process.env.SMTP_SECURE
  );
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

  const parsed = emailConfigSchema.safeParse({
    from: {
      default: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME,
    },
    provider: process.env.EMAIL_PROVIDER,
    smtp: process.env.SMTP_HOST
      ? {
          auth: {
            pass: process.env.SMTP_PASS,
            user: process.env.SMTP_USER,
          },
          host: process.env.SMTP_HOST,
          port: smtpPort,
          secure: isMailpitHost ? false : resolvedSecure,
        }
      : undefined,
  });

  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[error] Invalid email environment variables:",
        z.treeifyError(parsed.error)
      );
      throw new Error("Invalid email configuration");
    }
    return emailConfigSchema.parse({
      from: {
        default: "noreply@example.com",
        name: `${brand.appName} (Dev)`,
      },
      provider: "console",
    });
  }

  return parsed.data;
}
