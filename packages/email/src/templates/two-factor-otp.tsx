import { Heading, Section, Text } from "@react-email/components";
import React from "react";
import { BaseLayout } from "../components/base-layout";

export interface TwoFactorOtpEmailProps {
  expiresIn: string;
  ipAddress?: string;
  otp: string;
  userAgent?: string;
  userName: string;
}

export function TwoFactorOtpEmail({
  userName,
  otp,
  expiresIn,
  ipAddress,
  userAgent,
}: TwoFactorOtpEmailProps) {
  return (
    <BaseLayout previewText={`Your 2FA code: ${otp}`}>
      <Section>
        <Heading className="text-[28px] font-bold text-slate-900 text-center m-0 mb-6 leading-tight">
          Two-Factor Authentication
        </Heading>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-4">
          Hi {userName},
        </Text>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-6">
          A sign-in attempt requires verification. Use the code below to
          complete your login.
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
        {(ipAddress || userAgent) && (
          <Section className="bg-slate-50 rounded-lg p-4 border border-slate-100 mt-6">
            <Text className="text-[13px] text-slate-500 m-0 leading-relaxed">
              <strong>Sign-in attempt details:</strong>
              {ipAddress && (
                <>
                  <br />
                  IP Address: {ipAddress}
                </>
              )}
              {userAgent && (
                <>
                  <br />
                  Device: {userAgent}
                </>
              )}
            </Text>
          </Section>
        )}
        <Text className="text-[14px] text-slate-400 leading-relaxed m-0 text-center mt-6">
          If you did not attempt to sign in, please secure your account
          immediately by changing your password.
        </Text>
      </Section>
    </BaseLayout>
  );
}

TwoFactorOtpEmail.PreviewProps = {
  userName: "Ada",
  otp: "123456",
  expiresIn: "3 minutes",
  ipAddress: "192.168.1.1",
  userAgent: "Chrome on macOS",
} satisfies TwoFactorOtpEmailProps;

export default TwoFactorOtpEmail;
