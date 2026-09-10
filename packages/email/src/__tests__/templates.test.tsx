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
  test("NotificationEmail renders with action button", async () => {
    const html = await render(
      <NotificationEmail
        actionLabel="View Invitation"
        actionUrl="https://example.com/shares/123"
        body="John wants to share a card ending in 4242 with you."
        subject="Card share invitation"
      />
    );

    expect(html).toContain("Card share invitation");
    expect(html).toContain(
      "John wants to share a card ending in 4242 with you."
    );
    expect(html).toContain("https://example.com/shares/123");
    expect(html).toContain("View Invitation");
  });

  test("NotificationEmail renders without action button", async () => {
    const html = await render(
      <NotificationEmail
        body="Just letting you know your statement is ready."
        subject="Statement ready"
      />
    );

    expect(html).toContain("Statement ready");
    expect(html).toContain("Just letting you know your statement is ready.");
    expect(html).not.toContain("View Details");
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

  test("TwoFactorOtpEmail renders with device metadata", async () => {
    const html = await render(
      <TwoFactorOtpEmail
        expiresIn="3 minutes"
        ipAddress="192.168.1.1"
        otp="123456"
        userAgent="Chrome on macOS"
        userName="Ada"
      />
    );

    expect(html).toContain("123456");
    expect(html).toContain("Ada");
    expect(html).toContain("192.168.1.1");
    expect(html).toContain("Chrome on macOS");
    expect(html).toContain("Sign-in attempt details");
  });

  test("TwoFactorOtpEmail renders without device metadata", async () => {
    const html = await render(
      <TwoFactorOtpEmail expiresIn="3 minutes" otp="654321" userName="Ada" />
    );

    expect(html).toContain("654321");
    expect(html).not.toContain("Sign-in attempt details");
  });

  test.each([
    {
      description: "Use the code below to complete your sign-in.",
      title: "Sign In Verification",
      type: "sign-in",
    },
    {
      description: "Use the code below to verify your email address.",
      title: "Verify Your Email",
      type: "email-verification",
    },
    {
      description: "Use the code below to reset your password.",
      title: "Reset Your Password",
      type: "forget-password",
    },
  ] as const)(
    "VerificationOtpEmail renders the $type email",
    async ({ description, title, type }) => {
      const html = await render(
        <VerificationOtpEmail
          expiresIn="10 minutes"
          otp="123456"
          type={type}
          userName="Ada"
        />
      );

      expect(html).toContain(title);
      expect(html).toContain(description);
      expect(html).toContain("123456");
    }
  );

  test("WelcomeEmail renders the user name and login URL", async () => {
    const html = await render(
      <WelcomeEmail loginUrl="https://example.com/login" userName="Ada" />
    );

    expect(html).toContain("Welcome,");
    expect(html).toContain("Ada");
    expect(html).toContain("https://example.com/login");
  });
});
