import type { EmailConfig } from "../lib/config";
import { ConsoleTransport } from "./console";
import {
  type CreateNodemailerTransporter,
  NodemailerTransport,
} from "./nodemailer";
import type { EmailTransport } from "./types";

export type {
  CreateNodemailerTransporter,
  MailOptions,
  MailTransporter,
  NodemailerConfig,
  NodemailerOptions,
} from "./nodemailer";
export type {
  EmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

export function createTransport(
  config: EmailConfig,
  createTransporter?: CreateNodemailerTransporter
): EmailTransport {
  const hasSmtpConfig = Boolean(config.smtp?.host && config.smtp?.auth.user);
  const usesNodemailer =
    config.provider === undefined || config.provider === "nodemailer";

  if (hasSmtpConfig && usesNodemailer && config.smtp) {
    return new NodemailerTransport(config.smtp, createTransporter);
  }

  if (process.env.NODE_ENV === "production") {
    const problem =
      config.provider === "console"
        ? 'EMAIL_PROVIDER="console" is not allowed in production.'
        : "No email transport is configured.";

    throw new Error(
      `${problem} Set SMTP_HOST, SMTP_USER and SMTP_PASS, and set EMAIL_PROVIDER="nodemailer" (or leave it unset).`
    );
  }

  console.warn(
    "[warn] No valid email transport configuration found. Falling back to ConsoleTransport."
  );
  return new ConsoleTransport();
}
