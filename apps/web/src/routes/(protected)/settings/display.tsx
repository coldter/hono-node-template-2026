import { createFileRoute } from "@tanstack/react-router";
import { SettingsDisplay } from "@/modules/settings/display";

export const Route = createFileRoute("/(protected)/settings/display")({
  component: SettingsDisplay,
});
