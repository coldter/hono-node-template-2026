import { BoxSelectIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FullPageEmptyStateProps {
  children?: React.ReactNode;
  className?: string;
  description?: string;
  icon?: LucideIcon;
  title: string;
}

export function FullPageEmptyState({
  icon: Icon = BoxSelectIcon,
  title,
  description,
  children,
  className,
}: FullPageEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[calc(100vh-theme(spacing.16))] items-center justify-center p-4 text-center",
        className
      )}
    >
      <div className="flex w-full max-w-xl flex-col items-center justify-center p-8">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon size={60} strokeWidth={1} />
        </div>

        <div className="mb-4 space-y-1">
          <h1 className="font-semibold text-2xl">{title}</h1>
          {description && (
            <p className="font-medium text-muted-foreground">{description}</p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
