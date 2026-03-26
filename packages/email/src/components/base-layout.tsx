import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
} from "@react-email/components";
import type { ReactNode } from "react";
import React from "react";
import { EmailFooter } from "./footer";
import { EmailLogo } from "./logo";

interface BaseLayoutProps {
  appName?: string;
  children: ReactNode;
  companyAddress?: string;
  companyName?: string;
  previewText: string;
  supportEmail?: string;
}

export function BaseLayout({
  children,
  previewText,
  appName,
  companyName,
  companyAddress,
  supportEmail,
}: BaseLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fallbackFontFamily="Helvetica"
          fontFamily="Inter"
          fontStyle="normal"
          fontWeight={400}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v12/UcCOjFGCW979A7N7Vbr7v9mg.woff2",
            format: "woff2",
          }}
        />
        <Font
          fallbackFontFamily="Helvetica"
          fontFamily="Inter"
          fontStyle="normal"
          fontWeight={600}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v12/UcC7jFGCW979A7N7Vbr7v9mg.woff2",
            format: "woff2",
          }}
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: {
                  DEFAULT: "#000000",
                  primary: "#2563eb",
                },
                slate: {
                  50: "#f8fafc",
                  100: "#f1f5f9",
                  200: "#e2e8f0",
                  300: "#cbd5e1",
                  400: "#94a3b8",
                  500: "#64748b",
                  600: "#475569",
                  700: "#334155",
                  800: "#1e293b",
                  900: "#0f172a",
                  950: "#020617",
                },
              },
            },
          },
        }}
      >
        <Body className="bg-slate-50 font-sans text-slate-900">
          <Container className="mx-auto max-w-[600px] py-12 px-4">
            <Section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <Section className="p-8 pb-0">
                <EmailLogo appName={appName} />
              </Section>
              <Section className="p-8 pt-4">{children}</Section>
            </Section>
            <EmailFooter
              companyAddress={companyAddress}
              companyName={companyName}
              supportEmail={supportEmail}
            />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
