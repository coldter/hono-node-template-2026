import { render } from "@react-email/render";
import { describe, expect, test } from "vitest";
import { NotificationEmail } from "../templates/notification";
import { TwoFactorOtpEmail } from "../templates/two-factor-otp";
import { VerificationOtpEmail } from "../templates/verification-otp";

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

    expect(withMetadata).toContain(">123456<");
    expect(withMetadata).toContain("Ada");
    expect(withMetadata).toContain("192.168.1.1");
    expect(withMetadata).toContain("Chrome on macOS");
    expect(withMetadata).toContain("Sign-in attempt details");

    const withoutMetadata = await render(
      <TwoFactorOtpEmail expiresIn="3 minutes" otp="654321" userName="Ada" />
    );

    expect(withoutMetadata).toContain(">654321<");
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
    expect(html).toContain(">123456<");
  });
});
