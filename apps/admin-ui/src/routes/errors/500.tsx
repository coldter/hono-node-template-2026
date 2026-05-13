import { createFileRoute } from "@tanstack/react-router";
import { GeneralError } from "@/modules/errors/general-error";

export const Route = createFileRoute("/errors/500")({
  component: GeneralError,
});
