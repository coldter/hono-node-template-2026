import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import type { NavigateFn } from "@/hooks/use-table-url-state";
import { useTableUrlState } from "@/hooks/use-table-url-state";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
} from "@/modules/data-table";
import { Route } from "@/routes/(protected)/audit-logs/index";
import { useAuditLogsQuery } from "../query";
import { auditLogsColumns } from "./columns";

export function AuditLogsTable() {
  const routeNavigate = Route.useNavigate();
  const search = Route.useSearch();

  const tableNavigate: NavigateFn = ({ search: searchUpdate, replace }) => {
    if (typeof searchUpdate === "function") {
      routeNavigate({
        search: (prev) => ({ ...prev, ...searchUpdate(prev) }),
        replace,
      });
    } else if (searchUpdate === true) {
      routeNavigate({ search: true, replace });
    } else {
      routeNavigate({
        search: (prev) => ({ ...prev, ...searchUpdate }),
        replace,
      });
    }
  };

  const {
    pagination,
    onPaginationChange,
    sorting,
    onSortingChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate: tableNavigate,
    pagination: {
      defaultPage: 1,
      defaultPageSize: 20,
    },
    sorting: {
      defaultSort: "createdAt",
      defaultOrder: "desc",
    },
  });

  const { data, isLoading, isError } = useAuditLogsQuery({
    page: pagination.pageIndex + 1,
    perPage: pagination.pageSize,
    sort: sorting[0]?.id,
    order: sorting[0]?.desc ? "desc" : "asc",
    event: search.event,
    actorId: search.actorId,
    targetType: search.targetType,
  });

  const pageCount = data?.meta.pageCount ?? 0;

  useMemo(() => {
    ensurePageInRange(pageCount);
  }, [pageCount, ensurePageInRange]);

  const table = useReactTable({
    data: data?.data ?? [],
    columns: auditLogsColumns,
    pageCount,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <div className="@container/content space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground">
            Track all system activity and user actions.
          </p>
        </div>
      </div>

      <DataTableToolbar searchPlaceholder="Filter events..." table={table} />

      <DataTable
        columns={auditLogsColumns}
        data={data?.data ?? []}
        emptyMessage="No audit logs found."
        isError={isError}
        isLoading={isLoading}
        table={table}
      />

      <DataTablePagination table={table} />
    </div>
  );
}
