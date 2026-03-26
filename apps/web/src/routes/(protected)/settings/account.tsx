import { createFileRoute } from "@tanstack/react-router";
import { SettingsAccount } from "@/modules/settings/account";

export const Route = createFileRoute("/(protected)/settings/account")({
  component: SettingsAccount,
});
