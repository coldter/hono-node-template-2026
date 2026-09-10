import { createHash } from "node:crypto";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { createTransport, type EmailTransport } from "../transports";
import type { SendEmailOptions } from "../transports/types";
import { type EmailConfig, getEmailConfig } from "./config";

export interface SendEmailParams<T> {
  options?: Omit<SendEmailOptions, "to" | "subject" | "html" | "text" | "from">;
  props: T;
  subject: string;
  template: (props: T) => ReactElement;
  to: string | string[];
}

export type CreateEmailTransport = (config: EmailConfig) => EmailTransport;

function transportKey(config: EmailConfig): string {
  if (config.provider === "console") {
    return "console";
  }
  if (config.smtp) {
    const passHash = createHash("sha256")
      .update(config.smtp.auth.pass)
      .digest("hex");

    return `nodemailer:${config.smtp.host}:${config.smtp.port}:${String(config.smtp.secure)}:${config.smtp.auth.user}:${passHash}`;
  }
  return "fallback";
}

export function createEmailSender(
  createEmailTransport: CreateEmailTransport = createTransport
) {
  let cachedTransport: EmailTransport | undefined;
  let cachedTransportKey: string | undefined;

  function getTransport(config: EmailConfig): EmailTransport {
    const key = transportKey(config);
    if (cachedTransport && cachedTransportKey === key) {
      return cachedTransport;
    }

    const transport = createEmailTransport(config);
    cachedTransport?.close();
    cachedTransport = transport;
    cachedTransportKey = key;

    return transport;
  }

  return async function sendEmail<T>(
    params: SendEmailParams<T>
  ): Promise<{ messageId?: string }> {
    const config = getEmailConfig();
    const transport = getTransport(config);
    const reactElement = params.template(params.props);
    const html = await render(reactElement);
    const text = await render(reactElement, { plainText: true });

    const result = await transport.send({
      ...params.options,
      from: {
        address: config.from.default,
        name: config.from.name,
      },
      html,
      subject: params.subject,
      text,
      to: params.to,
    });

    if (!result.success) {
      throw result.error ?? new Error("Email delivery failed");
    }

    return { messageId: result.messageId };
  };
}

export const sendEmail = createEmailSender();
