import { Skeleton } from "@/modules/ui/skeleton";
import { TableCell, TableRow } from "@/modules/ui/table";

type TableSkeletonProps = {
  columnCount: number;
  rowCount?: number;
};

export function TableSkeleton({
  columnCount,
  rowCount = 10,
}: TableSkeletonProps) {
  return Array.from({ length: rowCount }).map((_, i) => (
    <TableRow key={`skeleton-row-${i}`}>
      {Array.from({ length: columnCount }).map((_, j) => (
        <TableCell key={`skeleton-cell-${i}-${j}`}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ));
}
