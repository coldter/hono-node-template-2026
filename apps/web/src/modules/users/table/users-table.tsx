import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";

import type { NavigateFn } from "@/hooks/use-table-url-state";
import { useTableUrlState } from "@/hooks/use-table-url-state";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
} from "@/modules/data-table";
import { Route, type UsersSearch } from "@/routes/(protected)/users/index";

import { useUsersQuery } from "../query";
import { usersColumns } from "./columns";

export function UsersTable() {
  const routeNavigate = Route.useNavigate();
  const search = Route.useSearch();

  const tableNavigate: NavigateFn = ({ search: searchUpdate, replace }) => {
    if (typeof searchUpdate === "function") {
      routeNavigate({
        search: (prev: UsersSearch) => ({ ...prev, ...searchUpdate(prev) }),
        replace,
      });
    } else if (searchUpdate === true) {
      routeNavigate({ search: true, replace });
    } else {
      routeNavigate({
        search: (prev: UsersSearch) => ({ ...prev, ...searchUpdate }),
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

  const { data, isLoading, isError } = useUsersQuery({
    page: pagination.pageIndex + 1,
    perPage: pagination.pageSize,
    sort: sorting[0]?.id,
    order: sorting[0]?.desc ? "desc" : "asc",
    search: search.search,
    status: search.status,
    role: search.role,
  });

  const pageCount = data?.meta.pageCount ?? 0;

  useMemo(() => {
    ensurePageInRange(pageCount);
  }, [pageCount, ensurePageInRange]);

  const table = useReactTable({
    data: data?.data ?? [],
    columns: usersColumns,
    pageCount,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  return (
    <div className="space-y-4">
      <DataTableToolbar searchPlaceholder="Search users..." table={table} />
      <DataTable
        columns={usersColumns}
        data={data?.data ?? []}
        emptyMessage="No users found."
        isError={isError}
        isLoading={isLoading}
        table={table}
      />
      <DataTablePagination table={table} />
    </div>
  );
}
