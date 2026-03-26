export interface SendEmailOptions {
  bcc?: string | string[];
  cc?: string | string[];
  from?: {
    name: string;
    address: string;
  };
  html: string;
  replyTo?: string;
  subject: string;
  text?: string;
  to: string | string[];
}

export interface SendEmailResult {
  error?: Error;
  messageId?: string;
  success: boolean;
}

export interface EmailTransport {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}
