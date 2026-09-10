import { Section, Text } from "@react-email/components";
import { getBrandConfig } from "@repo/shared/brand";

interface EmailLogoProps {
  appName?: string;
}

const brand = getBrandConfig(process.env);

export function EmailLogo({ appName = brand.appName }: EmailLogoProps) {
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
