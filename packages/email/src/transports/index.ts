import type { EmailConfig } from "../lib/config";
import { ConsoleTransport } from "./console";
import { NodemailerTransport } from "./nodemailer";
import type { EmailTransport } from "./types";

export type {
  EmailTransport,
  SendEmailOptions,
  SendEmailResult,
} from "./types";

export function createTransport(config: EmailConfig): EmailTransport {
  switch (config.kind) {
    case "console":
      return new ConsoleTransport();
    case "smtp":
      return new NodemailerTransport(config.smtp);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown email config: ${JSON.stringify(exhaustive)}`);
    }
  }
}
