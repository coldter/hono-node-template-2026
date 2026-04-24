import { z } from "zod";

export const sortOrderSchema = z
  .enum(["asc", "desc"])
  .default("desc")
  .meta({ description: "Sort order" });

export type SortOrder = z.infer<typeof sortOrderSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .min(1)
    .default(1)
    .meta({ description: "Page number (1-indexed)" }),
  perPage: z.coerce
    .number()
    .min(1)
    .max(100)
    .default(20)
    .meta({ description: "Items per page (max 100)" }),
  sort: z.string().optional().meta({ description: "Sort by column" }),
  order: sortOrderSchema,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  total: z.number().meta({ description: "Total number of items" }),
  page: z.number().meta({ description: "Current page number" }),
  perPage: z.number().meta({ description: "Items per page" }),
  pageCount: z.number().meta({ description: "Total number of pages" }),
  hasNext: z.boolean().meta({ description: "Whether there is a next page" }),
  hasPrev: z
    .boolean()
    .meta({ description: "Whether there is a previous page" }),
  nextPage: z
    .number()
    .nullable()
    .meta({ description: "Next page number or null" }),
  prevPage: z
    .number()
    .nullable()
    .meta({ description: "Previous page number or null" }),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const createPaginatedResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
  description = "Paginated response"
) =>
  z
    .object({
      data: z.array(dataSchema),
      meta: paginationMetaSchema,
    })
    .meta({ description });

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  PER_PAGE: 20,
  MAX_PER_PAGE: 100,
  ORDER: "desc" as SortOrder,
} as const;

export function getPaginationParams(query: Partial<PaginationQuery>) {
  const page = query.page ?? PAGINATION_DEFAULTS.PAGE;
  const perPage = Math.min(
    query.perPage ?? PAGINATION_DEFAULTS.PER_PAGE,
    PAGINATION_DEFAULTS.MAX_PER_PAGE
  );
  const offset = (page - 1) * perPage;
  const sort = query.sort;
  const order = query.order ?? PAGINATION_DEFAULTS.ORDER;

  return { page, perPage, offset, sort, order } as const;
}

// Overloads: when no formatter is supplied, the return type is PaginatedResponse<T>.
// When a formatter is supplied, the return type is PaginatedResponse<R>.
export function createPaginatedResponse<T>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
}): PaginatedResponse<T>;
export function createPaginatedResponse<T, R>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
  formatter: (item: T) => R;
}): PaginatedResponse<R>;
export function createPaginatedResponse<T, R>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
  formatter?: (item: T) => R;
}): PaginatedResponse<T> | PaginatedResponse<R> {
  const { data, total, query, formatter } = options;
  const { page, perPage } = getPaginationParams(query);
  const pageCount = Math.ceil(total / perPage);
  const meta = {
    total,
    page,
    perPage,
    pageCount,
    hasNext: page < pageCount,
    hasPrev: page > 1,
    nextPage: page < pageCount ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };

  if (formatter) {
    return {
      data: data.map(formatter),
      meta,
    };
  }

  return { data, meta };
}
