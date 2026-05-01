import type { SortOrder } from "@repo/shared/pagination";
import { asc, type Column, desc, type SQL } from "drizzle-orm";

export type {
  PaginatedResponse,
  PaginationMeta,
  PaginationQuery,
  SortOrder,
} from "@repo/shared/pagination";
export {
  createPaginatedResponse,
  createPaginatedResponseSchema,
  getPaginationParams,
  PAGINATION_DEFAULTS,
  paginationMetaSchema,
  paginationQuerySchema,
  sortOrderSchema,
} from "@repo/shared/pagination";

export function buildOrderBy<T extends Record<string, Column>>(
  columns: T,
  sort: string | undefined,
  order: SortOrder,
  fallback: T[keyof T]
): SQL {
  const column =
    sort !== undefined && sort in columns ? columns[sort as keyof T] : fallback;
  return order === "asc" ? asc(column) : desc(column);
}
