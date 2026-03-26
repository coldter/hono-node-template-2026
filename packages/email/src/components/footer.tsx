import { Hr, Link, Section, Text } from "@react-email/components";
import React from "react";

interface EmailFooterProps {
  companyAddress?: string;
  companyName?: string;
  supportEmail?: string;
}

export function EmailFooter({
  companyName = "Your App",
  companyAddress = "123 Street Address, City, State 12345",
  supportEmail = "support@example.com",
}: EmailFooterProps) {
  return (
    <Section className="mt-8">
      <Hr className="border-slate-200 mb-6" />
      <Text className="text-center text-[12px] text-slate-500 mb-2 leading-relaxed">
        Questions? We're here to help. Contact us at{" "}
        <Link
          className="text-blue-600 underline"
          href={`mailto:${supportEmail}`}
        >
          {supportEmail}
        </Link>
      </Text>
      <Text className="text-center text-[12px] text-slate-400 m-0 uppercase tracking-wider font-semibold">
        &copy; {new Date().getFullYear()} {companyName}
      </Text>
      <Text className="text-center text-[12px] text-slate-400 m-0 mt-1">
        {companyAddress}
      </Text>
    </Section>
  );
}
