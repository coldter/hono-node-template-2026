import { z } from "@hono/zod-openapi";

export const sortOrderSchema = z
  .enum(["asc", "desc"])
  .default("desc")
  .openapi({ description: "Sort order" });

export type SortOrder = z.infer<typeof sortOrderSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .min(1)
    .default(1)
    .openapi({ description: "Page number (1-indexed)" }),
  perPage: z.coerce
    .number()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ description: "Items per page (max 100)" }),
  sort: z.string().optional().openapi({ description: "Sort by column" }),
  order: sortOrderSchema,
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  total: z.number().openapi({ description: "Total number of items" }),
  page: z.number().openapi({ description: "Current page number" }),
  perPage: z.number().openapi({ description: "Items per page" }),
  pageCount: z.number().openapi({ description: "Total number of pages" }),
  hasNext: z.boolean().openapi({ description: "Whether there is a next page" }),
  hasPrev: z
    .boolean()
    .openapi({ description: "Whether there is a previous page" }),
  nextPage: z
    .number()
    .nullable()
    .openapi({ description: "Next page number or null" }),
  prevPage: z
    .number()
    .nullable()
    .openapi({ description: "Previous page number or null" }),
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
    .openapi({ description });

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

export function createPaginatedResponse<T, R = T>(options: {
  data: T[];
  total: number;
  query: Partial<PaginationQuery>;
  formatter?: (item: T) => R;
}): PaginatedResponse<R> {
  const { data, total, query, formatter } = options;
  const { page, perPage } = getPaginationParams(query);
  const pageCount = Math.ceil(total / perPage);

  return {
    data: formatter ? data.map(formatter) : (data as unknown as R[]),
    meta: {
      total,
      page,
      perPage,
      pageCount,
      hasNext: page < pageCount,
      hasPrev: page > 1,
      nextPage: page < pageCount ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    },
  };
}
