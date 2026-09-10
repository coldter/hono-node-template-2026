import { z } from "zod";

export const sortOrderSchema = z
  .enum(["asc", "desc"])
  .default("desc")
  .meta({ description: "Sort order" });

export type SortOrder = z.infer<typeof sortOrderSchema>;

export const paginationQuerySchema = z.object({
  order: sortOrderSchema,
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
  sort: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .optional()
    .meta({ description: "Sort by column" }),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  hasNext: z.boolean().meta({ description: "Whether there is a next page" }),
  hasPrev: z
    .boolean()
    .meta({ description: "Whether there is a previous page" }),
  nextPage: z
    .number()
    .nullable()
    .meta({ description: "Next page number or null" }),
  page: z.number().meta({ description: "Current page number" }),
  pageCount: z.number().meta({ description: "Total number of pages" }),
  perPage: z.number().meta({ description: "Items per page" }),
  prevPage: z
    .number()
    .nullable()
    .meta({ description: "Previous page number or null" }),
  total: z.number().meta({ description: "Total number of items" }),
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
  MAX_PER_PAGE: 100,
  ORDER: "desc" as SortOrder,
  PAGE: 1,
  PER_PAGE: 20,
} as const;

export function getPaginationParams(query: Partial<PaginationQuery>) {
  const requestedPage = query.page ?? PAGINATION_DEFAULTS.PAGE;
  const requestedPerPage = query.perPage ?? PAGINATION_DEFAULTS.PER_PAGE;
  const requested = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : PAGINATION_DEFAULTS.PAGE;
  const perPage = Number.isFinite(requestedPerPage)
    ? Math.min(
        Math.max(1, Math.trunc(requestedPerPage)),
        PAGINATION_DEFAULTS.MAX_PER_PAGE
      )
    : PAGINATION_DEFAULTS.PER_PAGE;
  const maxPage = Math.floor(Number.MAX_SAFE_INTEGER / perPage);
  const page = Math.min(requested, maxPage);
  const offset = (page - 1) * perPage;
  const { sort } = query;
  const order = query.order ?? PAGINATION_DEFAULTS.ORDER;

  return { offset, order, page, perPage, sort } as const;
}

function buildPaginationMeta(
  page: number,
  perPage: number,
  total: number
): PaginationMeta {
  const pageCount = Math.ceil(total / perPage);

  return {
    hasNext: page < pageCount,
    hasPrev: page > 1,
    nextPage: page < pageCount ? page + 1 : null,
    page,
    pageCount,
    perPage,
    prevPage: page > 1 ? page - 1 : null,
    total,
  };
}

export function createPaginatedResponse<T>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
}): PaginatedResponse<T>;
export function createPaginatedResponse<T, R>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
  formatter: (item: T) => R | null | undefined;
}): PaginatedResponse<R>;
export function createPaginatedResponse<T, R>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
  formatter?: (item: T) => R | null | undefined;
}): PaginatedResponse<T> | PaginatedResponse<R> {
  const { data, total, query, formatter } = options;
  const { page, perPage } = getPaginationParams(query);
  const meta = buildPaginationMeta(page, perPage, total);

  if (formatter) {
    const formatted: R[] = [];

    for (const item of data) {
      const result = formatter(item);
      if (result !== null && result !== undefined) {
        formatted.push(result);
      }
    }

    return { data: formatted, meta };
  }

  return { data, meta };
}
