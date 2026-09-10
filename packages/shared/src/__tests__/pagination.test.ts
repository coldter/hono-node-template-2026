import { describe, expect, it } from "vitest";
import {
  createPaginatedResponse,
  getPaginationParams,
  PAGINATION_DEFAULTS,
  paginationMetaSchema,
} from "../pagination";

describe("getPaginationParams", () => {
  it("applies defaults, clamps and truncates page/perPage, and caps offsets at a safe integer", () => {
    expect(getPaginationParams({})).toEqual({
      offset: 0,
      order: PAGINATION_DEFAULTS.ORDER,
      page: PAGINATION_DEFAULTS.PAGE,
      perPage: PAGINATION_DEFAULTS.PER_PAGE,
      sort: undefined,
    });

    expect(getPaginationParams({ page: 0 }).page).toBe(1);
    expect(getPaginationParams({ page: -7 }).page).toBe(1);
    expect(getPaginationParams({ page: 2.9 }).page).toBe(2);
    expect(getPaginationParams({ perPage: 0 }).perPage).toBe(1);
    expect(getPaginationParams({ perPage: -10 }).perPage).toBe(1);
    expect(getPaginationParams({ perPage: 9.9 }).perPage).toBe(9);
    expect(getPaginationParams({ perPage: 5000 }).perPage).toBe(
      PAGINATION_DEFAULTS.MAX_PER_PAGE
    );

    expect(getPaginationParams({ page: Number.NaN }).page).toBe(
      PAGINATION_DEFAULTS.PAGE
    );
    expect(getPaginationParams({ page: Number.POSITIVE_INFINITY }).page).toBe(
      PAGINATION_DEFAULTS.PAGE
    );
    expect(
      getPaginationParams({ perPage: Number.NEGATIVE_INFINITY }).perPage
    ).toBe(PAGINATION_DEFAULTS.PER_PAGE);

    const capped = getPaginationParams({
      page: Number.MAX_VALUE,
      perPage: PAGINATION_DEFAULTS.MAX_PER_PAGE,
    });
    expect(Number.isSafeInteger(capped.offset)).toBe(true);
    expect(capped.page).toBe(
      Math.floor(Number.MAX_SAFE_INTEGER / PAGINATION_DEFAULTS.MAX_PER_PAGE)
    );
  });

  it("passes requested page, perPage, order, and sort through", () => {
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
});

describe("createPaginatedResponse", () => {
  it("derives meta for middle, last, and empty pages from the authoritative total", () => {
    const middle = createPaginatedResponse({
      data: [{ id: "a" }, { id: "b" }],
      query: { page: 2, perPage: 20 },
      total: 42,
    });

    expect(middle).toEqual({
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
    expect(paginationMetaSchema.parse(middle.meta)).toEqual(middle.meta);

    const last = createPaginatedResponse({
      data: [{ id: "z" }],
      query: { page: 3, perPage: 20 },
      total: 42,
    });

    expect(last.meta).toMatchObject({
      hasNext: false,
      nextPage: null,
      page: 3,
      pageCount: 3,
      prevPage: 2,
      total: 42,
    });

    const empty = createPaginatedResponse({ data: [], query: {}, total: 0 });

    expect(empty).toEqual({
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
});
