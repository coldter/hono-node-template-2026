import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  RowData,
  SortingState,
  Table,
} from "@tanstack/react-table";
import type { DataTableFeatures } from "./features";

export type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: string;
  pageCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  table?: Table<DataTableFeatures, TData>;
};
