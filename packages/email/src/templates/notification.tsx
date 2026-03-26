import { Button, Heading, Section, Text } from "@react-email/components";
import React from "react";
import { BaseLayout } from "../components/base-layout";

interface NotificationEmailProps {
  actionLabel?: string;
  actionUrl?: string;
  body: string;
  subject: string;
}

export function NotificationEmail({
  subject,
  body,
  actionUrl,
  actionLabel,
}: NotificationEmailProps) {
  return (
    <BaseLayout previewText={body.slice(0, 140)}>
      <Section>
        <Heading className="text-[24px] font-bold text-slate-900 m-0 mb-4 leading-tight">
          {subject}
        </Heading>
        <Text className="text-[16px] text-slate-600 leading-relaxed m-0 mb-6 whitespace-pre-line">
          {body}
        </Text>
        {actionUrl ? (
          <Section className="text-center mb-4">
            <Button
              className="bg-brand-primary text-white text-[16px] font-bold no-underline text-center px-8 py-3 rounded-lg inline-block"
              href={actionUrl}
            >
              {actionLabel ?? "View Details"}
            </Button>
          </Section>
        ) : null}
      </Section>
    </BaseLayout>
  );
}

NotificationEmail.PreviewProps = {
  subject: "Card share invitation",
  body: "John wants to share a card ending in 4242 with you.",
  actionUrl: "https://example.com/shares/123",
  actionLabel: "View Invitation",
} satisfies NotificationEmailProps;

export default NotificationEmail;
