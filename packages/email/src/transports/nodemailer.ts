import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import type { ConnectionOptions } from "node:tls";
import nodemailer, { type Transporter } from "nodemailer";
import type {
  EmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

interface NodemailerConfig {
  auth: {
    pass: string;
    user: string;
  };
  host: string;
  port: number;
  secure?: boolean;
  tls?: ConnectionOptions;
}

interface SocketError extends Error {
  address?: string;
  code?: string;
  command?: string;
  reason?: string;
}

function buildMailOptions(options: SendEmailOptions) {
  return {
    bcc: options.bcc,
    cc: options.cc,
    from: options.from
      ? `${options.from.name} <${options.from.address}>`
      : undefined,
    html: options.html,
    replyTo: options.replyTo,
    subject: options.subject,
    text: options.text,
    to: options.to,
  };
}

type MailOptions = ReturnType<typeof buildMailOptions>;

function normalizeErrorText(value: string | undefined): string {
  return value?.toLowerCase().replaceAll("_", " ") ?? "";
}

function isWrongTlsVersionError(error: SocketError): boolean {
  if (error.code !== "ESOCKET" || error.command !== "CONN") {
    return false;
  }

  const reason = normalizeErrorText(error.reason);
  const message = normalizeErrorText(error.message);

  return (
    reason.includes("wrong version number") ||
    message.includes("wrong version number")
  );
}

function isIpv6RouteError(error: SocketError): boolean {
  return (
    error.code === "ENETUNREACH" &&
    typeof error.address === "string" &&
    isIP(error.address) === 6
  );
}

function createTransporter(config: NodemailerConfig): Transporter {
  return nodemailer.createTransport({
    ...config,
    requireTLS: process.env.NODE_ENV === "production" && config.secure !== true,
    tls: { minVersion: "TLSv1.2", ...config.tls },
  });
}

function closeTransporter(transporter: Transporter, label: string): void {
  try {
    transporter.close();
  } catch (error) {
    console.warn(`Failed to close ${label}:`, error);
  }
}

export class NodemailerTransport implements EmailTransport {
  private config: NodemailerConfig;
  private transporter: Transporter;

  constructor(config: NodemailerConfig) {
    this.config = config;
    this.transporter = createTransporter(config);
  }

  close(): void {
    this.transporter.close();
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const mailOptions = buildMailOptions(options);

    try {
      const info = await this.transporter.sendMail(mailOptions);

      return {
        messageId: info.messageId,
        success: true,
      };
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      const socketError = normalizedError as SocketError;

      if (isWrongTlsVersionError(socketError) && this.config.secure !== true) {
        const upgraded = await this.sendWithSecureUpgrade(mailOptions);
        if (upgraded) {
          return upgraded;
        }
      }

      if (isIpv6RouteError(socketError)) {
        const overIpv4 = await this.sendOverIpv4(mailOptions);
        if (overIpv4) {
          return overIpv4;
        }

        return {
          error: new Error(
            `${normalizedError.message}. SMTP connection failed over IPv6. Ensure the SMTP host has an A record reachable from this network, or set SMTP_HOST to an IPv4-reachable endpoint.`
          ),
          success: false,
        };
      }

      return {
        error: normalizedError,
        success: false,
      };
    }
  }

  private async sendWithSecureUpgrade(
    mailOptions: MailOptions
  ): Promise<SendEmailResult | undefined> {
    const upgradedConfig: NodemailerConfig = { ...this.config, secure: true };
    const upgradedTransporter = createTransporter(upgradedConfig);

    try {
      const info = await upgradedTransporter.sendMail(mailOptions);
      const previousTransporter = this.transporter;
      this.transporter = upgradedTransporter;
      this.config = upgradedConfig;
      closeTransporter(previousTransporter, "previous SMTP transport");

      return {
        messageId: info.messageId,
        success: true,
      };
    } catch (error) {
      closeTransporter(upgradedTransporter, "temporary SMTP transport");
      console.warn(
        `SMTP retry with secure=true failed for ${this.config.host}:${this.config.port}:`,
        error
      );
      return undefined;
    }
  }

  private async sendOverIpv4(
    mailOptions: MailOptions
  ): Promise<SendEmailResult | undefined> {
    try {
      const [ipv4Host] = await resolve4(this.config.host);
      if (!ipv4Host) {
        return;
      }

      const ipv4Transporter = createTransporter({
        ...this.config,
        host: ipv4Host,
        tls: { ...this.config.tls, servername: this.config.host },
      });

      try {
        const info = await ipv4Transporter.sendMail(mailOptions);

        return {
          messageId: info.messageId,
          success: true,
        };
      } finally {
        closeTransporter(ipv4Transporter, "temporary IPv4 SMTP transport");
      }
    } catch (error) {
      console.warn("SMTP IPv4 retry failed:", error);
      return undefined;
    }
  }
}
