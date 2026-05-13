import { createFileRoute } from "@tanstack/react-router";
import { ForbiddenError } from "@/modules/errors/forbidden";

export const Route = createFileRoute("/errors/403")({
  component: ForbiddenError,
});
