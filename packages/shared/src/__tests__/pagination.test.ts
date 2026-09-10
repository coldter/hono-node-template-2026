import { describe, expect, expectTypeOf, it } from "vitest";
import {
  createPaginatedResponse,
  getPaginationParams,
  PAGINATION_DEFAULTS,
  type PaginatedResponse,
  type PaginationMeta,
  paginationMetaSchema,
  paginationQuerySchema,
  type SortOrder,
} from "../pagination";

describe("getPaginationParams", () => {
  it("returns defaults for an empty query", () => {
    expect(getPaginationParams({})).toEqual({
      offset: 0,
      order: PAGINATION_DEFAULTS.ORDER,
      page: PAGINATION_DEFAULTS.PAGE,
      perPage: PAGINATION_DEFAULTS.PER_PAGE,
      sort: undefined,
    });
  });

  it("clamps page to at least 1", () => {
    expect(getPaginationParams({ page: 0 }).page).toBe(1);
    expect(getPaginationParams({ page: -7 }).page).toBe(1);
    expect(getPaginationParams({ page: 0 }).offset).toBe(0);
  });

  it("truncates fractional page and perPage", () => {
    expect(getPaginationParams({ page: 2.9 }).page).toBe(2);
    expect(getPaginationParams({ perPage: 9.9 }).perPage).toBe(9);
  });

  it("clamps perPage between 1 and MAX_PER_PAGE", () => {
    expect(getPaginationParams({ perPage: 0 }).perPage).toBe(1);
    expect(getPaginationParams({ perPage: -10 }).perPage).toBe(1);
    expect(getPaginationParams({ perPage: 5000 }).perPage).toBe(
      PAGINATION_DEFAULTS.MAX_PER_PAGE
    );
  });

  it("falls back to defaults for non-finite values", () => {
    expect(getPaginationParams({ page: Number.NaN }).page).toBe(
      PAGINATION_DEFAULTS.PAGE
    );
    expect(getPaginationParams({ page: Number.POSITIVE_INFINITY }).page).toBe(
      PAGINATION_DEFAULTS.PAGE
    );
    expect(getPaginationParams({ perPage: Number.NaN }).perPage).toBe(
      PAGINATION_DEFAULTS.PER_PAGE
    );
    expect(
      getPaginationParams({ perPage: Number.NEGATIVE_INFINITY }).perPage
    ).toBe(PAGINATION_DEFAULTS.PER_PAGE);
  });

  it("caps pages so offsets stay safe integers", () => {
    const params = getPaginationParams({
      page: Number.MAX_VALUE,
      perPage: PAGINATION_DEFAULTS.MAX_PER_PAGE,
    });

    expect(Number.isSafeInteger(params.offset)).toBe(true);
    expect(params.page).toBe(
      Math.floor(Number.MAX_SAFE_INTEGER / PAGINATION_DEFAULTS.MAX_PER_PAGE)
    );
  });

  it("caps huge pages parsed from the query schema", () => {
    const query = paginationQuerySchema.parse({
      page: "1.7976931348623157e+308",
    });
    const params = getPaginationParams(query);

    expect(Number.isSafeInteger(params.offset)).toBe(true);
  });

  it("passes sort and order through unchanged", () => {
    expect(
      getPaginationParams({ order: "asc", page: 3, perPage: 10, sort: "email" })
    ).toEqual({
      offset: 20,
      order: "asc",
      page: 3,
      perPage: 10,
      sort: "email",
    });
  });

  it("accepts coerced values from paginationQuerySchema", () => {
    const params = getPaginationParams(
      paginationQuerySchema.parse({
        order: "asc",
        page: "2",
        perPage: "50",
        sort: "name",
      })
    );

    expect(params).toEqual({
      offset: 50,
      order: "asc",
      page: 2,
      perPage: 50,
      sort: "name",
    });
  });

  it("keeps its return types", () => {
    expectTypeOf(getPaginationParams({}).order).toEqualTypeOf<SortOrder>();
    expectTypeOf(getPaginationParams({}).page).toEqualTypeOf<number>();
  });
});

describe("createPaginatedResponse", () => {
  it("derives meta from the authoritative total", () => {
    const response = createPaginatedResponse({
      data: [{ id: "a" }, { id: "b" }],
      query: { page: 2, perPage: 20 },
      total: 42,
    });

    expect(response).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      meta: {
        hasNext: true,
        hasPrev: true,
        nextPage: 3,
        page: 2,
        pageCount: 3,
        perPage: 20,
        prevPage: 1,
        total: 42,
      },
    });
    expect(paginationMetaSchema.parse(response.meta)).toEqual(response.meta);
  });

  it("reports no next page on the last page", () => {
    const response = createPaginatedResponse({
      data: [{ id: "z" }],
      query: { page: 3, perPage: 20 },
      total: 42,
    });

    expect(response.meta).toMatchObject({
      hasNext: false,
      nextPage: null,
      page: 3,
      pageCount: 3,
      prevPage: 2,
      total: 42,
    });
  });

  it("handles an empty result set", () => {
    const response = createPaginatedResponse({ data: [], query: {}, total: 0 });

    expect(response).toEqual({
      data: [],
      meta: {
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        page: 1,
        pageCount: 0,
        perPage: 20,
        prevPage: null,
        total: 0,
      },
    });
  });

  it("drops null and undefined formatter results without changing total", () => {
    const response = createPaginatedResponse({
      data: [1, 2, 3, 4, 5],
      formatter: (item: number) => {
        if (item === 1) {
          return null;
        }
        if (item === 2) {
          return;
        }
        return { value: item };
      },
      query: { page: 2, perPage: 2 },
      total: 5,
    });

    expect(response.data).toEqual([{ value: 3 }, { value: 4 }, { value: 5 }]);
    expect(response.meta).toEqual({
      hasNext: true,
      hasPrev: true,
      nextPage: 3,
      page: 2,
      pageCount: 3,
      perPage: 2,
      prevPage: 1,
      total: 5,
    });
  });

  it("supports both overloads at runtime", () => {
    const plain = createPaginatedResponse({
      data: ["alpha"],
      query: {},
      total: 1,
    });
    const formatted = createPaginatedResponse({
      data: ["alpha", "beta"],
      formatter: (item: string) => item.toUpperCase(),
      query: {},
      total: 2,
    });

    expect(plain).toEqual<PaginatedResponse<string>>({
      data: ["alpha"],
      meta: {
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        page: 1,
        pageCount: 1,
        perPage: 20,
        prevPage: null,
        total: 1,
      },
    });
    expect(formatted.data).toEqual(["ALPHA", "BETA"]);
    expectTypeOf(plain).toEqualTypeOf<PaginatedResponse<string>>();
    expectTypeOf(formatted).toEqualTypeOf<PaginatedResponse<string>>();
    expectTypeOf(plain.meta).toEqualTypeOf<PaginationMeta>();
  });
});
