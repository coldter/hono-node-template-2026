import { flexRender, functionalUpdate, useTable } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import type { NavigateFn } from "@/hooks/use-table-url-state";
import { useTableUrlState } from "@/hooks/use-table-url-state";
import { DataTablePagination, dataTableFeatures } from "@/modules/data-table";
import { TableEmpty } from "@/modules/data-table/table-empty";
import { TableError } from "@/modules/data-table/table-error";
import { TableSkeleton } from "@/modules/data-table/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/ui/table";
import { Route } from "@/routes/(protected)/audit-logs/index";
import { AuditLogDetailSheet } from "../detail";
import { useAuditLogsQuery } from "../query";
import { type AuditLog, auditLogsColumns } from "./columns";
import { AuditLogsFilters } from "./filters";
import { AuditLogsHeader } from "./header";

export function AuditLogsTable() {
  const routeNavigate = Route.useNavigate();
  const search = Route.useSearch();
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const tableNavigate: NavigateFn = ({ search: searchUpdate, replace }) => {
    if (searchUpdate === true) {
      routeNavigate({ replace, search: true });
      return;
    }

    routeNavigate({
      replace,
      search: (prev) => ({
        ...prev,
        ...functionalUpdate(searchUpdate, prev),
      }),
    });
  };

  const {
    pagination,
    onPaginationChange,
    sorting,
    onSortingChange,
    ensurePageInRange,
  } = useTableUrlState({
    navigate: tableNavigate,
    pagination: {
      defaultPage: 1,
      defaultPageSize: 20,
    },
    search,
    sorting: {
      defaultOrder: "desc",
      defaultSort: "createdAt",
    },
  });

  const { data, isLoading, isError } = useAuditLogsQuery({
    actorId: search.actorId,
    event: search.event,
    order: sorting[0]?.desc ? "desc" : "asc",
    page: pagination.pageIndex + 1,
    perPage: pagination.pageSize,
    sort: sorting[0]?.id,
    targetType: search.targetType,
  });

  const pageCount = data?.meta.pageCount ?? 0;

  useEffect(() => {
    ensurePageInRange(pageCount);
  }, [pageCount, ensurePageInRange]);

  const table = useTable({
    columns: auditLogsColumns,
    data: data?.data ?? [],
    features: dataTableFeatures,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onPaginationChange,
    onSortingChange,
    pageCount,
    state: { pagination, sorting },
  });

  function handleRowClick(log: AuditLog) {
    setSelectedLog(log);
    setDetailOpen(true);
  }

  const renderContent = () => {
    if (isError) {
      return <TableError colSpan={auditLogsColumns.length} />;
    }

    if (isLoading) {
      return <TableSkeleton columnCount={auditLogsColumns.length} />;
    }

    const { rows } = table.getRowModel();
    if (rows.length === 0) {
      return (
        <TableEmpty
          colSpan={auditLogsColumns.length}
          message="No audit logs found."
        />
      );
    }

    return rows.map((row) => (
      <TableRow
        aria-label={`View audit log ${row.original.id}`}
        className="cursor-pointer transition-colors"
        key={row.id}
        onClick={() => handleRowClick(row.original)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleRowClick(row.original);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  return (
    <div className="@container/content space-y-4 p-6">
      <AuditLogsHeader totalCount={data?.meta.total} />

      <AuditLogsFilters navigate={tableNavigate} search={search} />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{renderContent()}</TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />

      <AuditLogDetailSheet
        log={selectedLog}
        onOpenChange={setDetailOpen}
        open={detailOpen}
      />
    </div>
  );
}
