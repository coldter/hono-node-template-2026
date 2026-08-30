/** biome-ignore-all lint/suspicious/noConsole: it's console transporter */
import type {
  EmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

export class ConsoleTransport implements EmailTransport {
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    console.log("---------------------------------------");
    console.log("[email/console] Email sent (Console Transport)");
    console.log(
      `To: ${Array.isArray(options.to) ? options.to.join(", ") : options.to}`
    );
    console.log(`Subject: ${options.subject}`);
    console.log(`From: ${options.from?.name} <${options.from?.address}>`);
    if (options.replyTo) {
      console.log(`Reply-To: ${options.replyTo}`);
    }
    if (options.cc) {
      console.log(
        `Cc: ${Array.isArray(options.cc) ? options.cc.join(", ") : options.cc}`
      );
    }
    console.log("Body (HTML):");
    console.log(options.html);
    if (options.text) {
      console.log("Body (Text):");
      console.log(options.text);
    }
    console.log("---------------------------------------");

    return {
      messageId: `console-${crypto.randomUUID()}`,
      success: true,
    };
  }
}
