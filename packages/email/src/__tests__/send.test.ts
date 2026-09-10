import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const nodemailerMock = vi.hoisted(() => ({
  createTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  createTransport: nodemailerMock.createTransport,
  default: { createTransport: nodemailerMock.createTransport },
}));

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

async function sendDummy() {
  const { sendEmail } = await import("../lib/send");

  return sendEmail<DummyProps>({
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
const SMTP_HOST_PATTERN = /SMTP_HOST/;
const EMAIL_PROVIDER_PATTERN = /EMAIL_PROVIDER/;
const SMTP_PORT_PATTERN = /SMTP_PORT/;
const SMTP_SECURE_PATTERN = /SMTP_SECURE/;

beforeEach(() => {
  vi.resetModules();
  restoreEnv();
  nodemailerMock.createTransport.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe("sendEmail", () => {
  test("sends through the console transport outside production", async () => {
    delete process.env.SMTP_HOST;

    const result = await sendDummy();

    expect(result.messageId).toMatch(CONSOLE_MESSAGE_ID_PATTERN);
    expect(nodemailerMock.createTransport).not.toHaveBeenCalled();
  });

  test("returns the messageId from a successful SMTP send", async () => {
    setSmtpEnv();
    const transporter = createFakeTransporter(async () => ({
      messageId: "smtp-message-id",
    }));
    nodemailerMock.createTransport.mockReturnValue(transporter);

    const result = await sendDummy();

    expect(result).toEqual({ messageId: "smtp-message-id" });
    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerMock.createTransport.mock.calls[0]?.[0]).toMatchObject({
      requireTLS: false,
      tls: { minVersion: "TLSv1.2" },
    });
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });

  test("throws when the transport fails to deliver", async () => {
    setSmtpEnv();
    nodemailerMock.createTransport.mockReturnValue(
      createFakeTransporter(async () => {
        throw new Error("SMTP delivery failed");
      })
    );

    await expect(sendDummy()).rejects.toThrow("SMTP delivery failed");
  });

  test("throws in production when no SMTP transport is configured", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SMTP_HOST;

    await expect(sendDummy()).rejects.toThrow(SMTP_HOST_PATTERN);
  });

  test("throws in production when EMAIL_PROVIDER is console", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "console";

    await expect(sendDummy()).rejects.toThrow(EMAIL_PROVIDER_PATTERN);
  });

  test("requires TLS with a TLS 1.2 minimum in production", async () => {
    process.env.NODE_ENV = "production";
    setSmtpEnv();
    nodemailerMock.createTransport.mockReturnValue(
      createFakeTransporter(async () => ({ messageId: "prod-message-id" }))
    );

    const result = await sendDummy();

    expect(result).toEqual({ messageId: "prod-message-id" });
    expect(nodemailerMock.createTransport.mock.calls[0]?.[0]).toMatchObject({
      requireTLS: true,
      tls: { minVersion: "TLSv1.2" },
    });
  });

  test.each([
    ["SMTP_PORT", "not-a-port", SMTP_PORT_PATTERN],
    ["SMTP_PORT", "70000", SMTP_PORT_PATTERN],
    ["SMTP_SECURE", "sometimes", SMTP_SECURE_PATTERN],
  ])(
    "throws when %s is set to invalid value %s",
    async (key, value, pattern) => {
      process.env[key] = value;

      await expect(sendDummy()).rejects.toThrow(pattern);
    }
  );

  test("does not downgrade to secure=false when secure=true hits a TLS error", async () => {
    setSmtpEnv({ SMTP_SECURE: "true" });
    nodemailerMock.createTransport.mockReturnValue(
      createFakeTransporter(async () => {
        throw tlsMismatchError();
      })
    );

    await expect(sendDummy()).rejects.toThrow("wrong version number");

    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(1);
    expect(nodemailerMock.createTransport.mock.calls[0]?.[0]).toMatchObject({
      secure: true,
    });
  });

  test("upgrades secure=false to secure=true after a TLS mismatch and keeps it", async () => {
    setSmtpEnv({ SMTP_SECURE: "false" });
    const failingTransporter = createFakeTransporter(async () => {
      throw tlsMismatchError();
    });
    const upgradedTransporter = createFakeTransporter(async () => ({
      messageId: "upgraded-message-id",
    }));
    nodemailerMock.createTransport
      .mockReturnValueOnce(failingTransporter)
      .mockReturnValueOnce(upgradedTransporter);

    const result = await sendDummy();

    expect(result).toEqual({ messageId: "upgraded-message-id" });
    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(2);
    expect(nodemailerMock.createTransport.mock.calls[1]?.[0]).toMatchObject({
      secure: true,
    });
    expect(failingTransporter.close).toHaveBeenCalledTimes(1);

    const secondResult = await sendDummy();

    expect(secondResult).toEqual({ messageId: "upgraded-message-id" });
    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(2);
  });

  test("upgrades secure=false when the runtime reports WRONG_VERSION_NUMBER", async () => {
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
      messageId: "bun-upgraded-message-id",
    }));
    nodemailerMock.createTransport
      .mockReturnValueOnce(failingTransporter)
      .mockReturnValueOnce(upgradedTransporter);

    const result = await sendDummy();

    expect(result).toEqual({ messageId: "bun-upgraded-message-id" });
    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(2);
    expect(nodemailerMock.createTransport.mock.calls[1]?.[0]).toMatchObject({
      secure: true,
    });
  });

  test("rebuilds the transport and closes the old one when the password rotates", async () => {
    setSmtpEnv({ SMTP_PASS: "first-pass" });
    const firstTransporter = createFakeTransporter(async () => ({
      messageId: "first-message-id",
    }));
    const secondTransporter = createFakeTransporter(async () => ({
      messageId: "second-message-id",
    }));
    nodemailerMock.createTransport
      .mockReturnValueOnce(firstTransporter)
      .mockReturnValueOnce(secondTransporter);

    await expect(sendDummy()).resolves.toEqual({
      messageId: "first-message-id",
    });

    process.env.SMTP_PASS = "second-pass";

    await expect(sendDummy()).resolves.toEqual({
      messageId: "second-message-id",
    });

    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(2);
    expect(firstTransporter.close).toHaveBeenCalledTimes(1);
    expect(secondTransporter.close).not.toHaveBeenCalled();
  });

  test("keeps the cached transport when the configuration is unchanged", async () => {
    setSmtpEnv();
    const transporter = createFakeTransporter(async () => ({
      messageId: "cached-message-id",
    }));
    nodemailerMock.createTransport.mockReturnValue(transporter);

    await sendDummy();
    await sendDummy();

    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(1);
    expect(transporter.close).not.toHaveBeenCalled();
  });
});
