import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";
import { BaseLayout } from "../components/base-layout";

interface WelcomeEmailProps {
  loginUrl: string;
  userName: string;
}

export function WelcomeEmail({ userName, loginUrl }: WelcomeEmailProps) {
  return (
    <BaseLayout previewText="Welcome aboard! Your account is ready.">
      <Section>
        <Heading className="text-[28px] font-bold text-slate-900 text-center m-0 mb-6 leading-tight">
          Welcome, {userName}!
        </Heading>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-6">
          We're thrilled to have you here. Your account is fully set up and
          ready to go. Dive in and start exploring your new dashboard today.
        </Text>
        <Section className="text-center mb-8">
          <Button
            className="bg-brand-primary text-white text-[16px] font-bold no-underline text-center px-10 py-4 rounded-lg inline-block shadow-lg"
            href={loginUrl}
          >
            Get Started
          </Button>
        </Section>
      </Section>
    </BaseLayout>
  );
}

WelcomeEmail.PreviewProps = {
  userName: "Ada",
  loginUrl: "https://example.com/login",
} satisfies WelcomeEmailProps;

export default WelcomeEmail;
