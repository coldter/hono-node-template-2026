import type { LucideIcon } from "lucide-react";
import { Spinner } from "@/modules/ui/spinner";
import { FullPageEmptyState } from "./full-page-empty-state";

export interface FullPageLoadingStateProps {
  description?: string;
  title?: string;
}

export function FullPageLoadingState({
  title = "Fetching...",
  description = "Please wait while we fetch your data...",
}: FullPageLoadingStateProps) {
  return (
    <FullPageEmptyState
      description={description}
      icon={Spinner as unknown as LucideIcon}
      title={title}
    />
  );
}
