import {
  type ColumnFiltersState,
  functionalUpdate,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import * as z from "zod/mini";

export type SearchParamValue =
  | readonly string[]
  | boolean
  | number
  | string
  | undefined;

export type SearchRecord = Record<string, SearchParamValue>;

export type SearchPatch = Partial<SearchRecord>;

export type NavigateFn = (opts: {
  search: true | SearchPatch | ((prev: SearchRecord) => SearchPatch);
  replace?: boolean;
}) => void;

type ColumnFilterConfig =
  | {
      columnId: string;
      searchKey: string;
      type?: "string";
      serialize?: (value: string) => SearchParamValue;
      deserialize?: (value: SearchParamValue) => string | undefined;
    }
  | {
      columnId: string;
      searchKey: string;
      type: "array";
      serialize?: (value: readonly string[]) => SearchParamValue;
      deserialize?: (value: SearchParamValue) => readonly string[] | undefined;
    };

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
  columnFilters?: ColumnFilterConfig[];
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

const numberParamSchema = z.number();
const stringParamSchema = z.string();
const stringArrayParamSchema = z.array(z.string());

const readNumberParam = (
  search: SearchRecord,
  key: string
): number | undefined => {
  const parsed = numberParamSchema.safeParse(search[key]);
  return parsed.success ? parsed.data : undefined;
};

const readStringParam = (
  search: SearchRecord,
  key: string
): string | undefined => {
  const parsed = stringParamSchema.safeParse(search[key]);
  return parsed.success ? parsed.data : undefined;
};

const readStringArrayParam = (
  search: SearchRecord,
  key: string
): readonly string[] | undefined => {
  const parsed = stringArrayParamSchema.safeParse(search[key]);
  return parsed.success ? parsed.data : undefined;
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

  const columnFilters: ColumnFiltersState = useMemo(() => {
    const collected: ColumnFiltersState = [];
    for (const cfg of columnFiltersCfg) {
      if (cfg.type === "array") {
        const value = cfg.deserialize
          ? (cfg.deserialize(search[cfg.searchKey]) ?? [])
          : (readStringArrayParam(search, cfg.searchKey) ?? []);
        if (value.length > 0) {
          collected.push({ id: cfg.columnId, value });
        }
        continue;
      }
      const value = cfg.deserialize
        ? (cfg.deserialize(search[cfg.searchKey]) ?? "")
        : (readStringParam(search, cfg.searchKey) ?? "");
      if (value.trim() !== "") {
        collected.push({ id: cfg.columnId, value });
      }
    }
    return collected;
  }, [columnFiltersCfg, search]);

  const pagination: PaginationState = useMemo(() => {
    const pageNum = readNumberParam(search, pageKey) ?? defaultPage;
    const pageSizeNum = readNumberParam(search, pageSizeKey) ?? defaultPageSize;
    return { pageIndex: Math.max(0, pageNum - 1), pageSize: pageSizeNum };
  }, [search, pageKey, pageSizeKey, defaultPage, defaultPageSize]);

  const sorting: SortingState = useMemo(() => {
    const id = readStringParam(search, sortKey) ?? defaultSort;
    const rawOrder = readStringParam(search, orderKey);
    const desc = rawOrder === "desc" || (!rawOrder && defaultOrder === "desc");
    return id ? [{ desc, id }] : [];
  }, [search, sortKey, orderKey, defaultSort, defaultOrder]);

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = functionalUpdate(updater, pagination);
    const nextPage = next.pageIndex + 1;
    const nextPageSize = next.pageSize;
    navigate({
      search: (prev) => ({
        ...prev,
        [pageKey]: nextPage <= defaultPage ? undefined : nextPage,
        [pageSizeKey]:
          nextPageSize === defaultPageSize ? undefined : nextPageSize,
      }),
    });
  };

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = functionalUpdate(updater, sorting);
    const [first] = next;

    let nextOrder: "asc" | "desc" | undefined;
    if (first) {
      if (first.desc === (defaultOrder === "desc")) {
        nextOrder = undefined;
      } else {
        nextOrder = first.desc ? "desc" : "asc";
      }
    }

    navigate({
      search: (prev) => ({
        ...prev,
        [pageKey]: undefined,
        [sortKey]: first?.id === defaultSort ? undefined : first?.id,
        [orderKey]: nextOrder,
      }),
    });
  };

  const globalFilter = globalFilterEnabled
    ? (readStringParam(search, globalFilterKey) ?? "")
    : undefined;

  const onGlobalFilterChange: OnChangeFn<string> | undefined =
    globalFilterEnabled
      ? (updater) => {
          const next = functionalUpdate(updater, globalFilter ?? "");
          const value = trimGlobal ? next.trim() : next;
          navigate({
            search: (prev) => ({
              ...prev,
              [pageKey]: undefined,
              [globalFilterKey]: value ? value : undefined,
            }),
          });
        }
      : undefined;

  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next = functionalUpdate(updater, columnFilters);

    const patch: SearchPatch = {};

    for (const cfg of columnFiltersCfg) {
      const found = next.find((filter) => filter.id === cfg.columnId);
      if (cfg.type === "array") {
        const parsed = stringArrayParamSchema.safeParse(found?.value);
        const value = parsed.success ? parsed.data : [];
        const serialize =
          cfg.serialize ?? ((serialized: readonly string[]) => serialized);
        patch[cfg.searchKey] = value.length > 0 ? serialize(value) : undefined;
        continue;
      }
      const parsed = stringParamSchema.safeParse(found?.value);
      const value = parsed.success ? parsed.data : "";
      const serialize = cfg.serialize ?? ((serialized: string) => serialized);
      patch[cfg.searchKey] = value.trim() === "" ? undefined : serialize(value);
    }

    navigate({
      search: (prev) => ({
        ...prev,
        [pageKey]: undefined,
        ...patch,
      }),
    });
  };

  const ensurePageInRange = (
    pageCount: number,
    opts: { resetTo?: "first" | "last" } = { resetTo: "first" }
  ) => {
    const pageNum = readNumberParam(search, pageKey) ?? defaultPage;
    if (pageCount > 0 && pageNum > pageCount) {
      navigate({
        replace: true,
        search: (prev) => ({
          ...prev,
          [pageKey]: opts.resetTo === "last" ? pageCount : undefined,
        }),
      });
    }
  };

  return {
    columnFilters,
    ensurePageInRange,
    globalFilter: globalFilterEnabled ? (globalFilter ?? "") : undefined,
    onColumnFiltersChange,
    onGlobalFilterChange,
    onPaginationChange,
    onSortingChange,
    pagination,
    sorting,
  };
}
