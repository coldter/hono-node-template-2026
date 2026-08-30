import { lazy, Suspense } from "react";
import { Skeleton } from "@/modules/ui/skeleton";

const OverviewContent = lazy(() =>
  import("./overview-content").then((module) => ({
    default: module.OverviewContent,
  }))
);

export function Overview() {
  return (
    <Suspense fallback={<Skeleton className="h-[350px] w-full" />}>
      <OverviewContent />
    </Suspense>
  );
}
