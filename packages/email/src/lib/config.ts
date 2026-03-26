import { z } from "zod";

function parseBooleanString(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off", ""].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseSmtpPort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    return undefined;
  }

  return parsed;
}

const emailConfigSchema = z.object({
  provider: z.enum(["nodemailer", "console"]).optional(),
  from: z.object({
    default: z.email().default("noreply@example.com"),
    name: z.string().default("Your App"),
  }),
  smtp: z
    .object({
      host: z.string(),
      port: z.coerce.number().default(587),
      secure: z.boolean().default(false),
      auth: z.object({
        user: z.string(),
        pass: z.string(),
      }),
    })
    .optional(),
});

export type EmailConfig = z.infer<typeof emailConfigSchema>;

export function getEmailConfig(): EmailConfig {
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

  const parsed = emailConfigSchema.safeParse({
    provider: process.env.EMAIL_PROVIDER,
    from: {
      default: process.env.EMAIL_FROM,
      name: process.env.EMAIL_FROM_NAME,
    },
    smtp: process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: smtpPort,
          secure: isMailpitHost ? false : resolvedSecure,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        }
      : undefined,
  });

  if (!parsed.success) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "❌ Invalid email environment variables:",
        z.treeifyError(parsed.error)
      );
      throw new Error("Invalid email configuration");
    }
    return {
      from: {
        default: "noreply@example.com",
        name: "Your App (Dev)",
      },
    } as EmailConfig;
  }

  return parsed.data;
}
