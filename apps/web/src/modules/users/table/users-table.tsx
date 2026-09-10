import { functionalUpdate, useTable } from "@tanstack/react-table";
import { useEffect } from "react";

import type { NavigateFn } from "@/hooks/use-table-url-state";
import { useTableUrlState } from "@/hooks/use-table-url-state";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  dataTableFeatures,
} from "@/modules/data-table";
import { Route, type UsersSearch } from "@/routes/(protected)/users/index";

import { useUsersQuery } from "../query";
import { usersColumns } from "./columns";

export function UsersTable() {
  const routeNavigate = Route.useNavigate();
  const search = Route.useSearch();

  const tableNavigate: NavigateFn = ({ search: searchUpdate, replace }) => {
    if (searchUpdate === true) {
      routeNavigate({ replace, search: true });
      return;
    }

    routeNavigate({
      replace,
      search: (prev: UsersSearch) => ({
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

  const { data, isLoading, isError } = useUsersQuery({
    order: sorting[0]?.desc ? "desc" : "asc",
    page: pagination.pageIndex + 1,
    perPage: pagination.pageSize,
    role: search.role,
    search: search.search,
    sort: sorting[0]?.id,
    status: search.status,
  });

  const pageCount = data?.meta.pageCount ?? 0;

  useEffect(() => {
    ensurePageInRange(pageCount);
  }, [pageCount, ensurePageInRange]);

  const table = useTable({
    columns: usersColumns,
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
