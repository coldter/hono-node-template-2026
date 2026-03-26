import type {
  ColumnFiltersState,
  OnChangeFn,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

type SearchRecord = Record<string, unknown>;

export type NavigateFn = (opts: {
  search:
    | true
    | SearchRecord
    | ((prev: SearchRecord) => Partial<SearchRecord> | SearchRecord);
  replace?: boolean;
}) => void;

type UseTableUrlStateParams = {
  search: SearchRecord;
  navigate: NavigateFn;
  pagination?: {
    pageKey?: string;
    pageSizeKey?: string;
    defaultPage?: number;
    defaultPageSize?: number;
  };
  sorting?: {
    sortKey?: string;
    orderKey?: string;
    defaultSort?: string;
    defaultOrder?: "asc" | "desc";
  };
  globalFilter?: {
    enabled?: boolean;
    key?: string;
    trim?: boolean;
  };
  columnFilters?: Array<
    | {
        columnId: string;
        searchKey: string;
        type?: "string";
        serialize?: (value: unknown) => unknown;
        deserialize?: (value: unknown) => unknown;
      }
    | {
        columnId: string;
        searchKey: string;
        type: "array";
        serialize?: (value: unknown) => unknown;
        deserialize?: (value: unknown) => unknown;
      }
  >;
};

type UseTableUrlStateReturn = {
  globalFilter?: string;
  onGlobalFilterChange?: OnChangeFn<string>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  ensurePageInRange: (
    pageCount: number,
    opts?: { resetTo?: "first" | "last" }
  ) => void;
};

export function useTableUrlState(
  params: UseTableUrlStateParams
): UseTableUrlStateReturn {
  const {
    search,
    navigate,
    pagination: paginationCfg,
    sorting: sortingCfg,
    globalFilter: globalFilterCfg,
    columnFilters: columnFiltersCfg = [],
  } = params;

  const pageKey = paginationCfg?.pageKey ?? "page";
  const pageSizeKey = paginationCfg?.pageSizeKey ?? "pageSize";
  const defaultPage = paginationCfg?.defaultPage ?? 1;
  const defaultPageSize = paginationCfg?.defaultPageSize ?? 10;

  const sortKey = sortingCfg?.sortKey ?? "sort";
  const orderKey = sortingCfg?.orderKey ?? "order";
  const defaultSort = sortingCfg?.defaultSort;
  const defaultOrder = sortingCfg?.defaultOrder ?? "desc";

  const globalFilterKey = globalFilterCfg?.key ?? "filter";
  const globalFilterEnabled = globalFilterCfg?.enabled ?? true;
  const trimGlobal = globalFilterCfg?.trim ?? true;

  const initialColumnFilters: ColumnFiltersState = useMemo(() => {
    const collected: ColumnFiltersState = [];
    for (const cfg of columnFiltersCfg) {
      const raw = (search as SearchRecord)[cfg.searchKey];
      const deserialize = cfg.deserialize ?? ((v: unknown) => v);
      if (cfg.type === "string") {
        const value = (deserialize(raw) as string) ?? "";
        if (typeof value === "string" && value.trim() !== "") {
          collected.push({ id: cfg.columnId, value });
        }
      } else {
        const value = (deserialize(raw) as unknown[]) ?? [];
        if (Array.isArray(value) && value.length > 0) {
          collected.push({ id: cfg.columnId, value });
        }
      }
    }
    return collected;
  }, [columnFiltersCfg, search]);

  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(initialColumnFilters);

  const pagination: PaginationState = useMemo(() => {
    const rawPage = (search as SearchRecord)[pageKey];
    const rawPageSize = (search as SearchRecord)[pageSizeKey];
    const pageNum = typeof rawPage === "number" ? rawPage : defaultPage;
    const pageSizeNum =
      typeof rawPageSize === "number" ? rawPageSize : defaultPageSize;
    return { pageIndex: Math.max(0, pageNum - 1), pageSize: pageSizeNum };
  }, [search, pageKey, pageSizeKey, defaultPage, defaultPageSize]);

  const sorting: SortingState = useMemo(() => {
    const rawSort = (search as SearchRecord)[sortKey];
    const rawOrder = (search as SearchRecord)[orderKey];
    const id = typeof rawSort === "string" ? rawSort : defaultSort;
    const desc = rawOrder === "desc" || (!rawOrder && defaultOrder === "desc");
    return id ? [{ id, desc }] : [];
  }, [search, sortKey, orderKey, defaultSort, defaultOrder]);

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    const nextPage = next.pageIndex + 1;
    const nextPageSize = next.pageSize;
    navigate({
      search: (prev) => ({
        ...(prev as SearchRecord),
        [pageKey]: nextPage <= defaultPage ? undefined : nextPage,
        [pageSizeKey]:
          nextPageSize === defaultPageSize ? undefined : nextPageSize,
      }),
    });
  };

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];

    let nextOrder: string | undefined;
    if (first) {
      if (first.desc === (defaultOrder === "desc")) {
        nextOrder = undefined;
      } else {
        nextOrder = first.desc ? "desc" : "asc";
      }
    }

    navigate({
      search: (prev) => ({
        ...(prev as SearchRecord),
        [pageKey]: undefined,
        [sortKey]: first?.id === defaultSort ? undefined : first?.id,
        [orderKey]: nextOrder,
      }),
    });
  };

  const [globalFilter, setGlobalFilter] = useState<string | undefined>(() => {
    if (!globalFilterEnabled) {
      return;
    }
    const raw = (search as SearchRecord)[globalFilterKey];
    return typeof raw === "string" ? raw : "";
  });

  const onGlobalFilterChange: OnChangeFn<string> | undefined =
    globalFilterEnabled
      ? (updater) => {
          const next =
            typeof updater === "function"
              ? updater(globalFilter ?? "")
              : updater;
          const value = trimGlobal ? next.trim() : next;
          setGlobalFilter(value);
          navigate({
            search: (prev) => ({
              ...(prev as SearchRecord),
              [pageKey]: undefined,
              [globalFilterKey]: value ? value : undefined,
            }),
          });
        }
      : undefined;

  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next =
      typeof updater === "function" ? updater(columnFilters) : updater;
    setColumnFilters(next);

    const patch: Record<string, unknown> = {};

    for (const cfg of columnFiltersCfg) {
      const found = next.find((f) => f.id === cfg.columnId);
      const serialize = cfg.serialize ?? ((v: unknown) => v);
      if (cfg.type === "string") {
        const value =
          typeof found?.value === "string" ? (found.value as string) : "";
        patch[cfg.searchKey] =
          value.trim() === "" ? undefined : serialize(value);
      } else {
        const value = Array.isArray(found?.value)
          ? (found!.value as unknown[])
          : [];
        patch[cfg.searchKey] = value.length > 0 ? serialize(value) : undefined;
      }
    }

    navigate({
      search: (prev) => ({
        ...(prev as SearchRecord),
        [pageKey]: undefined,
        ...patch,
      }),
    });
  };

  const ensurePageInRange = (
    pageCount: number,
    opts: { resetTo?: "first" | "last" } = { resetTo: "first" }
  ) => {
    const currentPage = (search as SearchRecord)[pageKey];
    const pageNum = typeof currentPage === "number" ? currentPage : defaultPage;
    if (pageCount > 0 && pageNum > pageCount) {
      navigate({
        replace: true,
        search: (prev) => ({
          ...(prev as SearchRecord),
          [pageKey]: opts.resetTo === "last" ? pageCount : undefined,
        }),
      });
    }
  };

  return {
    globalFilter: globalFilterEnabled ? (globalFilter ?? "") : undefined,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    sorting,
    onSortingChange,
    ensurePageInRange,
  };
}
