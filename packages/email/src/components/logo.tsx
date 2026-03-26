import { Section, Text } from "@react-email/components";
import React from "react";

interface EmailLogoProps {
  appName?: string;
}

export function EmailLogo({ appName = "Your App" }: EmailLogoProps) {
  return (
    <Section className="mb-8">
      <Section className="flex items-center justify-center">
        <div className="bg-black rounded-lg px-3 py-1">
          <Text className="text-white text-xl font-bold m-0 leading-none tracking-tight">
            {appName.toUpperCase()}
          </Text>
        </div>
      </Section>
    </Section>
  );
}
