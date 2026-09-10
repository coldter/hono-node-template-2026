import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import nodemailer, { type Transporter } from "nodemailer";
import type {
  EmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

export interface NodemailerConfig {
  auth: {
    user: string;
    pass: string;
  };
  host: string;
  port: number;
  secure?: boolean;
}

export class NodemailerTransport implements EmailTransport {
  private config: NodemailerConfig;
  private transporter: Transporter;

  constructor(config: NodemailerConfig) {
    this.config = config;
    this.transporter = nodemailer.createTransport(config);
  }

  private buildMailOptions(options: SendEmailOptions) {
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

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const mailOptions = this.buildMailOptions(options);

    try {
      const info = await this.transporter.sendMail(mailOptions);

      return {
        messageId: info.messageId,
        success: true,
      };
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));

      const maybeSocketError = normalizedError as Error & {
        address?: string;
        code?: string;
        command?: string;
        reason?: string;
      };

      const isWrongTlsVersionError =
        maybeSocketError.code === "ESOCKET" &&
        maybeSocketError.command === "CONN" &&
        (normalizedError.message.includes("wrong version number") ||
          maybeSocketError.reason === "wrong version number");

      if (isWrongTlsVersionError) {
        const toggledSecureConfig: NodemailerConfig = {
          ...this.config,
          secure: !this.config.secure,
        };
        const toggledTransport =
          nodemailer.createTransport(toggledSecureConfig);

        let retrySucceeded = false;
        try {
          const info = await toggledTransport.sendMail(mailOptions);
          retrySucceeded = true;

          const previousTransporter = this.transporter;
          this.transporter = toggledTransport;
          this.config = toggledSecureConfig;
          try {
            previousTransporter.close();
          } catch (closeError) {
            console.warn(
              "Failed to close previous SMTP transport:",
              closeError
            );
          }

          return {
            messageId: info.messageId,
            success: true,
          };
        } catch (retryError) {
          const normalizedRetryError =
            retryError instanceof Error
              ? retryError
              : new Error(String(retryError));
          console.warn(
            `SMTP retry with secure=${String(!this.config.secure)} failed:`,
            normalizedRetryError
          );
        } finally {
          if (!retrySucceeded) {
            try {
              toggledTransport.close();
            } catch (closeError) {
              console.warn(
                "Failed to close temporary SMTP transport:",
                closeError
              );
            }
          }
        }
      }

      const failedOnIpv6Address =
        typeof maybeSocketError.address === "string" &&
        isIP(maybeSocketError.address) === 6;

      if (
        maybeSocketError.code === "ENETUNREACH" &&
        failedOnIpv6Address &&
        this.config.host
      ) {
        try {
          const ipv4Addresses = await resolve4(this.config.host);
          const [ipv4Host] = ipv4Addresses;

          if (ipv4Host) {
            const ipv4Transport = nodemailer.createTransport({
              ...this.config,
              host: ipv4Host,
              tls: {
                servername: this.config.host,
              },
            });

            try {
              const info = await ipv4Transport.sendMail(mailOptions);

              return {
                messageId: info.messageId,
                success: true,
              };
            } finally {
              try {
                ipv4Transport.close();
              } catch (closeError) {
                console.warn(
                  "Failed to close temporary IPv4 SMTP transport:",
                  closeError
                );
              }
            }
          }
        } catch (ipv4RetryError) {
          const normalizedIpv4RetryError =
            ipv4RetryError instanceof Error
              ? ipv4RetryError
              : new Error(String(ipv4RetryError));
          console.warn("SMTP IPv4 retry failed:", normalizedIpv4RetryError);
        }
      }

      const looksLikeTlsMismatch =
        normalizedError.message.includes(
          "Cannot destructure property 'subject'"
        ) && normalizedError.message.includes("null or undefined value");

      const looksLikeIpv6RouteIssue =
        maybeSocketError.code === "ENETUNREACH" && failedOnIpv6Address;
      const looksLikeWrongTlsVersion = isWrongTlsVersionError;

      let enrichedError = normalizedError;
      if (looksLikeTlsMismatch) {
        enrichedError = new Error(
          `${normalizedError.message}. SMTP TLS handshake failed. If you're using Mailpit (port 1025), set SMTP_SECURE=false.`
        );
      } else if (looksLikeWrongTlsVersion) {
        enrichedError = new Error(
          `${normalizedError.message}. SMTP connection failed due to TLS mode mismatch. Try SMTP_SECURE=${String(!this.config.secure)} for ${this.config.host}:${this.config.port}.`
        );
      } else if (looksLikeIpv6RouteIssue) {
        enrichedError = new Error(
          `${normalizedError.message}. SMTP connection failed over IPv6. Ensure SMTP host has an A record reachable from this network, or set SMTP_HOST to an IPv4-reachable endpoint.`
        );
      }

      console.error("Nodemailer send failed:", enrichedError);
      return {
        error: enrichedError,
        success: false,
      };
    }
  }
}
