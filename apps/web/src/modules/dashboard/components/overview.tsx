import { lazy, Suspense } from "react";
import { Skeleton } from "@/modules/ui/skeleton";

// recharts is ~99KB gzip and Overview sits on the dashboard's default tab;
// loading it lazily lets the post-login shell paint before the chart code arrives.
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
