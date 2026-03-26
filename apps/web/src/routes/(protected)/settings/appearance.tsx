import { createFileRoute } from "@tanstack/react-router";
import { SettingsAppearance } from "@/modules/settings/appearance";

export const Route = createFileRoute("/(protected)/settings/appearance")({
  component: SettingsAppearance,
});
