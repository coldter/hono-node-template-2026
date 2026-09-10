import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/middlewares/rate-limit", () => ({
  globalRateLimitMW: async (_c: Context, next: Next) => {
    await next();
  },
  rateLimiter: vi.fn().mockReturnValue(async (_c: Context, next: Next) => {
    await next();
  }),
}));

vi.mock("@/auth/middleware", () => ({
  authorize: () => async (_c: Context, next: Next) => {
    await next();
  },
  getAuthorizedResource: () => null,
  resolvePrincipalFromContext: () => null,
}));

const findMock = vi.fn();

vi.mock("@/modules/audit-logs/service", () => ({
  auditLogService: {
    create: vi.fn(),
    find: (...args: unknown[]) => findMock(...args),
  },
}));

vi.mock("@/modules/auth/handler", () => ({
  default: new OpenAPIHono(),
}));

const auditLogsHandler = (await import("@/modules/audit-logs/handler")).default;

beforeEach(() => {
  findMock.mockReset();
});

type ListResponseBody = {
  data: Array<{ id: string; event: string }>;
  meta: { total: number; page: number; perPage: number; pageCount: number };
};

describe("audit-logs handler event filtering", () => {
  it("should drop rows with unknown event keys via flatMap", async () => {
    const baseRow = {
      actorId: "usr_actor",
      actorType: "user",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      event: "user.created",
      id: "row_known",
      ipAddress: "127.0.0.1",
      metadata: null,
      targetId: "usr_target",
      targetType: "user",
      userAgent: "vitest",
    };
    const unknownRow = {
      ...baseRow,
      event: "legacy.unknown.event",
      id: "row_unknown",
    };

    findMock.mockResolvedValueOnce({
      data: [baseRow, unknownRow],
      meta: { page: 1, pageCount: 1, perPage: 20, total: 2 },
    });

    const response = await auditLogsHandler.request(
      "http://localhost/?page=1&perPage=20"
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ListResponseBody;

    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe("row_known");
    expect(body.data[0]?.event).toBe("user.created");
    expect(body.data.find((r) => r.id === "row_unknown")).toBeUndefined();
  });

  it("should include rows whose event matches a known AUDIT_EVENT_KEY", async () => {
    const knownEvents = [
      { event: "auth.login.success", id: "r1" },
      { event: "role.assigned", id: "r2" },
    ];
    const rows = knownEvents.map((e) => ({
      ...e,
      actorId: null,
      actorType: "user",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      ipAddress: null,
      metadata: null,
      targetId: null,
      targetType: null,
      userAgent: null,
    }));

    findMock.mockResolvedValueOnce({
      data: rows,
      meta: { page: 1, pageCount: 1, perPage: 20, total: 2 },
    });

    const response = await auditLogsHandler.request(
      "http://localhost/?page=1&perPage=20"
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ListResponseBody;
    expect(body.data.map((r) => r.event)).toEqual([
      "auth.login.success",
      "role.assigned",
    ]);
  });

  it("keeps the server-reported total when rows are dropped during formatting", async () => {
    findMock.mockResolvedValueOnce({
      data: [
        {
          actorId: null,
          actorType: "user",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          event: "user.viewed",
          id: "r_keep",
          ipAddress: null,
          metadata: null,
          targetId: null,
          targetType: null,
          userAgent: null,
        },
        {
          actorId: null,
          actorType: "user",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          event: "unknown.event",
          id: "r_drop",
          ipAddress: null,
          metadata: null,
          targetId: null,
          targetType: null,
          userAgent: null,
        },
      ],
      meta: { page: 1, pageCount: 1, perPage: 20, total: 2 },
    });

    const response = await auditLogsHandler.request(
      "http://localhost/?page=1&perPage=20"
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ListResponseBody;
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(2);
    expect(body.meta.pageCount).toBe(1);
  });
});
