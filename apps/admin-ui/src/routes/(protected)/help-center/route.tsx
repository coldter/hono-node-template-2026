import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/modules/common/coming-soon";

export const Route = createFileRoute("/(protected)/help-center")({
  component: ComingSoon,
});
