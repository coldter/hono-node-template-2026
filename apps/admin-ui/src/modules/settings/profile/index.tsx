import { ContentSection } from "../components/content-section";
import { ChangePasswordDialog } from "./change-password-form";
import { ProfileInfoForm } from "./profile-info-form";
import { TwoFactorSection } from "./two-factor-section";

export function SettingsProfile() {
  return (
    <ContentSection
      desc="Manage your profile information, password, and security settings."
      title="Profile"
    >
      <div className="space-y-8">
        <ProfileInfoForm />

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">Security</h3>
            <p className="text-muted-foreground text-sm">
              Manage your password and additional security settings.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-none">Password</p>
              <p className="text-muted-foreground text-sm">
                Set a new password for your account.
              </p>
            </div>
            <ChangePasswordDialog />
          </div>
          <TwoFactorSection />
        </div>
      </div>
    </ContentSection>
  );
}
