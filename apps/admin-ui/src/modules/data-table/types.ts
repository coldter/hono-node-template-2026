import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  SortingState,
  Table,
} from "@tanstack/react-table";

export type DataTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: string;
  pageCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  table?: Table<TData>;
};
