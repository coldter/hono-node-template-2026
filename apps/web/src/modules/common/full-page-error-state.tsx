import { ServerCrashIcon } from "lucide-react";
import { FullPageEmptyState } from "./full-page-empty-state";

export interface FullPageErrorStateProps {
  children?: React.ReactNode;
  description?: string;
  title?: string;
}

export function FullPageErrorState({
  title = "Error...",
  description = "Something went wrong...",
  children,
}: FullPageErrorStateProps) {
  return (
    <FullPageEmptyState icon={ServerCrashIcon} title={title}>
      <div className="space-y-4">
        <p className="font-medium text-muted-foreground">{description}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </FullPageEmptyState>
  );
}
