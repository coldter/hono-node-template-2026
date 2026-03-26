import { ContentSection } from "../components/content-section";
import { NotificationsForm } from "./notifications-form";

export function SettingsNotifications() {
  return (
    <ContentSection
      desc="Configure how you receive notifications."
      title="Notifications"
    >
      <NotificationsForm />
    </ContentSection>
  );
}
