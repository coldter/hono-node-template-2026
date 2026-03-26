import { ContentSection } from "../components/content-section";
import { AccountForm } from "./account-form";

export function SettingsAccount() {
  return (
    <ContentSection
      desc="Update your account settings. Set your preferred language and
          timezone."
      title="Account"
    >
      <AccountForm />
    </ContentSection>
  );
}
