import { createFileRoute } from "@tanstack/react-router";
import { SettingsProfile } from "@/modules/settings/profile";

export const Route = createFileRoute("/(protected)/settings/")({
  component: SettingsProfile,
});
