import { ConsoleTransport } from "./console";
import { NodemailerTransport } from "./nodemailer";
import type { EmailTransport } from "./types";

export type {
  EmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

export function createTransport(config: {
  provider?: "nodemailer" | "console";
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}): EmailTransport {
  const isExplicitConsole = config.provider === "console";
  if (isExplicitConsole) {
    return new ConsoleTransport();
  }

  const hasSmtpConfig = config.smtp?.host && config.smtp?.auth?.user;
  const isExplicitNodemailer =
    config.provider === "nodemailer" && hasSmtpConfig;

  if (
    (isExplicitNodemailer || (!config.provider && hasSmtpConfig)) &&
    config.smtp
  ) {
    return new NodemailerTransport(config.smtp);
  }

  console.warn(
    "⚠️ No valid email transport configuration found. Falling back to ConsoleTransport."
  );
  return new ConsoleTransport();
}
