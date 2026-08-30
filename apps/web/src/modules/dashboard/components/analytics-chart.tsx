import { lazy, Suspense } from "react";
import { Skeleton } from "@/modules/ui/skeleton";

const AnalyticsChartContent = lazy(() =>
  import("./analytics-chart-content").then((module) => ({
    default: module.AnalyticsChartContent,
  }))
);

export function AnalyticsChart() {
  return (
    <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
      <AnalyticsChartContent />
    </Suspense>
  );
}
