import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createEmailSender } from "../lib/send";
import { createTransport } from "../transports";

interface DummyProps {
  name: string;
}

function DummyTemplate({ name }: DummyProps) {
  return createElement("div", null, `Hello ${name}`);
}

function createFakeTransporter(sendMail: () => Promise<{ messageId: string }>) {
  return {
    close: vi.fn(),
    sendMail: vi.fn(sendMail),
  };
}

const MANAGED_ENV_KEYS = [
  "BRAND_PRIMARY_COLOR",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "EMAIL_PROVIDER",
  "NODE_ENV",
  "SMTP_HOST",
  "SMTP_PASS",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
] as const;

const initialEnv = new Map(
  MANAGED_ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv(): void {
  for (const key of MANAGED_ENV_KEYS) {
    const value = initialEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setSmtpEnv(overrides: Record<string, string> = {}): void {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "smtp-user";
  process.env.SMTP_PASS = "smtp-pass";
  process.env.SMTP_SECURE = "false";

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

const createTransporter = vi.fn();

let sender: ReturnType<typeof createEmailSender>;

async function sendDummy(
  emailSender: ReturnType<typeof createEmailSender> = sender
) {
  return emailSender<DummyProps>({
    props: { name: "Ada" },
    subject: "Hello",
    template: DummyTemplate,
    to: "ada@example.com",
  });
}

function tlsMismatchError(): Error {
  return Object.assign(new Error("wrong version number"), {
    code: "ESOCKET",
    command: "CONN",
    reason: "wrong version number",
  });
}

const CONSOLE_MESSAGE_ID_PATTERN = /^console-/;
const NO_EMAIL_TRANSPORT_PATTERN = /No email transport is configured/;
const CONSOLE_PROVIDER_PATTERN =
  /EMAIL_PROVIDER="console" is not allowed in production/;
const SMTP_PORT_PATTERN = /SMTP_PORT/;
const SMTP_SECURE_PATTERN = /SMTP_SECURE/;

beforeEach(() => {
  restoreEnv();
  createTransporter.mockReset();
  sender = createEmailSender((config) =>
    createTransport(config, createTransporter)
  );
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  test("falls back to the console transport outside production", async () => {
    delete process.env.SMTP_HOST;

    const result = await sendDummy();

    expect(result.messageId).toMatch(CONSOLE_MESSAGE_ID_PATTERN);
    expect(createTransporter).not.toHaveBeenCalled();
  });

  test("returns the messageId, caches the transport, and rebuilds it when the SMTP password rotates", async () => {
    setSmtpEnv({ SMTP_PASS: "first-pass" });
    const firstTransporter = createFakeTransporter(async () => ({
      messageId: "first-message-id",
    }));
    const secondTransporter = createFakeTransporter(async () => ({
      messageId: "second-message-id",
    }));
    createTransporter
      .mockReturnValueOnce(firstTransporter)
      .mockReturnValueOnce(secondTransporter);

    await expect(sendDummy()).resolves.toEqual({
      messageId: "first-message-id",
    });
    await expect(sendDummy()).resolves.toEqual({
      messageId: "first-message-id",
    });

    expect(createTransporter).toHaveBeenCalledTimes(1);
    expect(createTransporter.mock.calls[0]?.[0]).toMatchObject({
      requireTLS: false,
      tls: { minVersion: "TLSv1.2" },
    });
    expect(firstTransporter.sendMail).toHaveBeenCalledTimes(2);

    process.env.SMTP_PASS = "second-pass";

    await expect(sendDummy()).resolves.toEqual({
      messageId: "second-message-id",
    });

    expect(createTransporter).toHaveBeenCalledTimes(2);
    expect(firstTransporter.close).toHaveBeenCalledTimes(1);
    expect(secondTransporter.close).not.toHaveBeenCalled();
  });

  test("propagates API errors and thrown delivery errors", async () => {
    const apiError = new Error("SMTP API rejected the message");
    const apiSender = createEmailSender(() => ({
      close: vi.fn(),
      send: async () => ({ error: apiError, success: false }),
    }));

    await expect(sendDummy(apiSender)).rejects.toBe(apiError);

    const silentSender = createEmailSender(() => ({
      close: vi.fn(),
      send: async () => ({ success: false }),
    }));

    await expect(sendDummy(silentSender)).rejects.toEqual(
      new Error("Email delivery failed")
    );

    setSmtpEnv();
    createTransporter.mockReturnValue(
      createFakeTransporter(async () => {
        throw new Error("SMTP delivery failed");
      })
    );

    await expect(sendDummy()).rejects.toThrow("SMTP delivery failed");
  });

  test("enforces production transport policy and validates SMTP settings", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SMTP_HOST;

    await expect(sendDummy()).rejects.toThrow(NO_EMAIL_TRANSPORT_PATTERN);

    process.env.EMAIL_PROVIDER = "console";

    await expect(sendDummy()).rejects.toThrow(CONSOLE_PROVIDER_PATTERN);

    delete process.env.EMAIL_PROVIDER;
    process.env.SMTP_PORT = "70000";

    await expect(sendDummy()).rejects.toThrow(SMTP_PORT_PATTERN);

    process.env.SMTP_PORT = "not-a-port";

    await expect(sendDummy()).rejects.toThrow(SMTP_PORT_PATTERN);

    delete process.env.SMTP_PORT;
    process.env.SMTP_SECURE = "sometimes";

    await expect(sendDummy()).rejects.toThrow(SMTP_SECURE_PATTERN);

    setSmtpEnv();
    createTransporter.mockReturnValue(
      createFakeTransporter(async () => ({ messageId: "prod-message-id" }))
    );

    await expect(sendDummy()).resolves.toEqual({
      messageId: "prod-message-id",
    });
    expect(createTransporter.mock.calls[0]?.[0]).toMatchObject({
      requireTLS: true,
      tls: { minVersion: "TLSv1.2" },
    });
  });

  test("upgrades an insecure transport on a TLS mismatch and never downgrades a secure one", async () => {
    setSmtpEnv({ SMTP_SECURE: "false" });
    const failingTransporter = createFakeTransporter(async () => {
      throw Object.assign(
        new Error(
          "error:100000f7:SSL routines:OPENSSL_internal:WRONG_VERSION_NUMBER"
        ),
        {
          code: "ESOCKET",
          command: "CONN",
          reason: "WRONG_VERSION_NUMBER",
        }
      );
    });
    const upgradedTransporter = createFakeTransporter(async () => ({
      messageId: "upgraded-message-id",
    }));
    createTransporter
      .mockReturnValueOnce(failingTransporter)
      .mockReturnValueOnce(upgradedTransporter);

    await expect(sendDummy()).resolves.toEqual({
      messageId: "upgraded-message-id",
    });
    expect(createTransporter).toHaveBeenCalledTimes(2);
    expect(createTransporter.mock.calls[1]?.[0]).toMatchObject({
      secure: true,
    });
    expect(failingTransporter.close).toHaveBeenCalledTimes(1);

    await expect(sendDummy()).resolves.toEqual({
      messageId: "upgraded-message-id",
    });
    expect(createTransporter).toHaveBeenCalledTimes(2);

    createTransporter.mockClear();
    process.env.SMTP_SECURE = "true";
    createTransporter.mockReturnValue(
      createFakeTransporter(async () => {
        throw tlsMismatchError();
      })
    );

    await expect(sendDummy()).rejects.toThrow("wrong version number");
    expect(createTransporter).toHaveBeenCalledTimes(1);
    expect(createTransporter.mock.calls[0]?.[0]).toMatchObject({
      secure: true,
    });

    process.env.SMTP_SECURE = "false";
    createTransporter.mockClear();
    const reasonOnlySender = createEmailSender((config) =>
      createTransport(config, createTransporter)
    );
    createTransporter
      .mockReturnValueOnce(
        createFakeTransporter(async () => {
          throw Object.assign(new Error("TLS handshake failed"), {
            code: "ESOCKET",
            command: "CONN",
            reason: "wrong version number",
          });
        })
      )
      .mockReturnValueOnce(
        createFakeTransporter(async () => ({
          messageId: "reason-only-message-id",
        }))
      );

    await expect(sendDummy(reasonOnlySender)).resolves.toEqual({
      messageId: "reason-only-message-id",
    });
    expect(createTransporter).toHaveBeenCalledTimes(2);
    expect(createTransporter.mock.calls[1]?.[0]).toMatchObject({
      secure: true,
    });

    createTransporter.mockClear();
    const messageOnlySender = createEmailSender((config) =>
      createTransport(config, createTransporter)
    );
    createTransporter
      .mockReturnValueOnce(
        createFakeTransporter(async () => {
          throw Object.assign(new Error("wrong version number"), {
            code: "ESOCKET",
            command: "CONN",
          });
        })
      )
      .mockReturnValueOnce(
        createFakeTransporter(async () => ({
          messageId: "message-only-message-id",
        }))
      );

    await expect(sendDummy(messageOnlySender)).resolves.toEqual({
      messageId: "message-only-message-id",
    });
    expect(createTransporter).toHaveBeenCalledTimes(2);
    expect(createTransporter.mock.calls[1]?.[0]).toMatchObject({
      secure: true,
    });
  });
});
