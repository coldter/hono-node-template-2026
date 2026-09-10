import { render } from "@react-email/render";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NotificationEmail } from "../templates/notification";
import { TwoFactorOtpEmail } from "../templates/two-factor-otp";
import { VerificationOtpEmail } from "../templates/verification-otp";
import { WelcomeEmail } from "../templates/welcome";

const BRAND_ENV_KEYS = [
  "APP_NAME",
  "COMPANY_NAME",
  "SUPPORT_EMAIL",
  "BRAND_PRIMARY_COLOR",
] as const;

const initialBrandEnv = new Map(
  BRAND_ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreBrandEnv(): void {
  for (const key of BRAND_ENV_KEYS) {
    const value = initialBrandEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreBrandEnv();
});

describe("Email templates", () => {
  test("NotificationEmail renders the action button only when actionUrl is set", async () => {
    const withAction = await render(
      <NotificationEmail
        actionLabel="View Invitation"
        actionUrl="https://example.com/shares/123"
        body="John wants to share a card ending in 4242 with you."
        subject="Card share invitation"
      />
    );

    expect(withAction).toContain("Card share invitation");
    expect(withAction).toContain(
      "John wants to share a card ending in 4242 with you."
    );
    expect(withAction).toContain("https://example.com/shares/123");
    expect(withAction).toContain("View Invitation");

    const withoutAction = await render(
      <NotificationEmail
        body="Just letting you know your statement is ready."
        subject="Statement ready"
      />
    );

    expect(withoutAction).toContain("Statement ready");
    expect(withoutAction).toContain(
      "Just letting you know your statement is ready."
    );
    expect(withoutAction).not.toContain("View Details");
  });

  test("NotificationEmail renders with brand environment overrides", async () => {
    process.env.APP_NAME = "Acme";
    process.env.COMPANY_NAME = "Acme Corp";
    process.env.SUPPORT_EMAIL = "help@acme.test";
    process.env.BRAND_PRIMARY_COLOR = "#123456";
    vi.resetModules();

    const { NotificationEmail: BrandedNotificationEmail } = await import(
      "../templates/notification"
    );
    const html = await render(
      <BrandedNotificationEmail
        actionLabel="View"
        actionUrl="https://example.com/x"
        body="Branded body"
        subject="Branded subject"
      />
    );

    expect(html).toContain("ACME");
    expect(html).toContain("Acme Corp");
    expect(html).toContain("help@acme.test");
    expect(html).toContain("rgb(18,52,86)");
  });

  test("TwoFactorOtpEmail renders the code and device metadata only when present", async () => {
    const withMetadata = await render(
      <TwoFactorOtpEmail
        expiresIn="3 minutes"
        ipAddress="192.168.1.1"
        otp="123456"
        userAgent="Chrome on macOS"
        userName="Ada"
      />
    );

    expect(withMetadata).toContain("123456");
    expect(withMetadata).toContain("Ada");
    expect(withMetadata).toContain("192.168.1.1");
    expect(withMetadata).toContain("Chrome on macOS");
    expect(withMetadata).toContain("Sign-in attempt details");

    const withoutMetadata = await render(
      <TwoFactorOtpEmail expiresIn="3 minutes" otp="654321" userName="Ada" />
    );

    expect(withoutMetadata).toContain("654321");
    expect(withoutMetadata).not.toContain("Sign-in attempt details");
  });

  test("VerificationOtpEmail renders the type-specific title and code", async () => {
    const html = await render(
      <VerificationOtpEmail
        expiresIn="10 minutes"
        otp="123456"
        type="email-verification"
        userName="Ada"
      />
    );

    expect(html).toContain("Verify Your Email");
    expect(html).toContain("Use the code below to verify your email address.");
    expect(html).toContain("123456");
  });

  test("WelcomeEmail renders the user name and login URL", async () => {
    const html = await render(
      <WelcomeEmail loginUrl="https://example.com/login" userName="Ada" />
    );

    expect(html).toContain("Welcome,");
    expect(html).toContain("Ada");
    expect(html).toContain("https://example.com/login");
  });
});
