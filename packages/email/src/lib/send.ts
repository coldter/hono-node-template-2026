import type { ReactElement } from "react";
import { createTransport } from "../transports";
import type { SendEmailOptions, SendEmailResult } from "../transports/types";
import { getEmailConfig } from "./config";
import { renderEmail } from "./render";

export interface SendEmailParams<T> {
  options?: Omit<SendEmailOptions, "to" | "subject" | "html" | "text" | "from">;
  props: T;
  subject: string;
  template: (props: T) => ReactElement;
  to: string | string[];
}

export async function sendEmail<T>(
  params: SendEmailParams<T>
): Promise<SendEmailResult> {
  const config = getEmailConfig();
  const transport = createTransport(config);

  try {
    const reactElement = params.template(params.props);
    const { html, text } = await renderEmail(reactElement);

    const result = await transport.send({
      ...params.options,
      to: params.to,
      subject: params.subject,
      html,
      text,
      from: {
        name: config.from.name,
        address: config.from.default,
      },
    });

    return result;
  } catch (error) {
    console.error("Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
