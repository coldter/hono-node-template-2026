import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "@/modules/settings";

export const Route = createFileRoute("/(protected)/settings")({
  component: Settings,
});
