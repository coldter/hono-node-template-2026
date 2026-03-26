import { ContentSection } from "../components/content-section";
import { DisplayForm } from "./display-form";

export function SettingsDisplay() {
  return (
    <ContentSection
      desc="Turn items on or off to control what's displayed in the app."
      title="Display"
    >
      <DisplayForm />
    </ContentSection>
  );
}
