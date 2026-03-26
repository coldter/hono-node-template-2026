import { Heading, Section, Text } from "@react-email/components";
import React from "react";
import { BaseLayout } from "../components/base-layout";

export interface VerificationOtpEmailProps {
  expiresIn: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password";
  userName: string;
}

const TYPE_TITLES: Record<VerificationOtpEmailProps["type"], string> = {
  "sign-in": "Sign In Verification",
  "email-verification": "Verify Your Email",
  "forget-password": "Reset Your Password",
};

const TYPE_DESCRIPTIONS: Record<VerificationOtpEmailProps["type"], string> = {
  "sign-in":
    "Use the code below to complete your sign-in. If you did not request this, you can safely ignore this email.",
  "email-verification":
    "Use the code below to verify your email address. If you did not create an account, you can safely ignore this email.",
  "forget-password":
    "Use the code below to reset your password. If you did not request a password reset, you can safely ignore this email.",
};

export function VerificationOtpEmail({
  userName,
  otp,
  type,
  expiresIn,
}: VerificationOtpEmailProps) {
  const title = TYPE_TITLES[type];
  const description = TYPE_DESCRIPTIONS[type];

  return (
    <BaseLayout previewText={`Your verification code: ${otp}`}>
      <Section>
        <Heading className="text-[28px] font-bold text-slate-900 text-center m-0 mb-6 leading-tight">
          {title}
        </Heading>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-4">
          Hi {userName},
        </Text>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-6">
          {description}
        </Text>
        <Section className="bg-slate-50 rounded-lg p-6 border border-slate-200 mb-6 text-center">
          <Text className="text-[14px] text-slate-500 m-0 mb-2">
            Your verification code is:
          </Text>
          <Text className="text-[36px] font-bold text-slate-900 m-0 tracking-[0.3em] font-mono">
            {otp}
          </Text>
        </Section>
        <Text className="text-[14px] text-slate-500 leading-relaxed m-0 text-center">
          This code will expire in <strong>{expiresIn}</strong>.
        </Text>
        <Text className="text-[14px] text-slate-400 leading-relaxed m-0 text-center mt-4">
          If you did not request this code, please ignore this email or contact
          support if you have concerns.
        </Text>
      </Section>
    </BaseLayout>
  );
}

VerificationOtpEmail.PreviewProps = {
  userName: "Ada",
  otp: "123456",
  type: "forget-password",
  expiresIn: "10 minutes",
} satisfies VerificationOtpEmailProps;

export default VerificationOtpEmail;
