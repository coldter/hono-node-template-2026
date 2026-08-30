import type { ReactElement } from "react";
import { createTransport, type EmailTransport } from "../transports";
import type { SendEmailOptions, SendEmailResult } from "../transports/types";
import { type EmailConfig, getEmailConfig } from "./config";
import { renderEmail } from "./render";

export interface SendEmailParams<T> {
  options?: Omit<SendEmailOptions, "to" | "subject" | "html" | "text" | "from">;
  props: T;
  subject: string;
  template: (props: T) => ReactElement;
  to: string | string[];
}

let cachedTransport: EmailTransport | undefined;
let cachedTransportKey: string | undefined;

function transportKey(config: EmailConfig): string {
  if (config.provider === "console") {
    return "console";
  }
  if (config.smtp) {
    return `nodemailer:${config.smtp.host}:${config.smtp.port}:${config.smtp.secure}:${config.smtp.auth.user}`;
  }
  return "fallback";
}

function getTransport(config: EmailConfig): EmailTransport {
  const key = transportKey(config);
  if (cachedTransport && cachedTransportKey === key) {
    return cachedTransport;
  }
  const transport = createTransport(config);
  cachedTransport = transport;
  cachedTransportKey = key;
  return transport;
}

export async function sendEmail<T>(
  params: SendEmailParams<T>
): Promise<SendEmailResult> {
  const config = getEmailConfig();
  const transport = getTransport(config);

  try {
    const reactElement = params.template(params.props);
    const { html, text } = await renderEmail(reactElement);

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

    return result;
  } catch (error) {
    console.error("Failed to send email:", error);
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      success: false,
    };
  }
}
