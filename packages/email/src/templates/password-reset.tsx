import { Button, Heading, Link, Section, Text } from "@react-email/components";
import React from "react";
import { BaseLayout } from "../components/base-layout";

interface PasswordResetEmailProps {
  expiresIn: string;
  resetUrl: string;
  userName: string;
}

export function PasswordResetEmail({
  userName,
  resetUrl,
  expiresIn,
}: PasswordResetEmailProps) {
  return (
    <BaseLayout previewText="Reset your password (link inside).">
      <Section>
        <Heading className="text-[28px] font-bold text-slate-900 text-center m-0 mb-6 leading-tight">
          Reset your password
        </Heading>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-4">
          Hi {userName},
        </Text>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-8">
          We received a request to reset the password for your account. No
          worries—it happens to the best of us. This link will be active for the
          next <strong>{expiresIn}</strong>.
        </Text>
        <Section className="text-center mb-8">
          <Button
            className="bg-brand-primary text-white text-[16px] font-bold no-underline text-center px-10 py-4 rounded-lg inline-block shadow-lg"
            href={resetUrl}
          >
            Reset Password
          </Button>
        </Section>
        <Section className="bg-slate-50 rounded-lg p-4 border border-slate-100 mb-6">
          <Text className="text-[13px] text-slate-500 m-0 leading-relaxed">
            If you're having trouble with the button, copy and paste this link
            into your browser:
            <br />
            <Link className="text-brand-primary break-all" href={resetUrl}>
              {resetUrl}
            </Link>
          </Text>
        </Section>
        <Text className="text-[14px] text-slate-400 leading-relaxed m-0 text-center">
          Didn't request this? You can safely ignore this email.
        </Text>
      </Section>
    </BaseLayout>
  );
}

PasswordResetEmail.PreviewProps = {
  userName: "Ada",
  resetUrl: "https://example.com/reset?token=abc123",
  expiresIn: "60 minutes",
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;
