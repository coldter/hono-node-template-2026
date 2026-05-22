import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/middlewares/rate-limit", () => ({
  rateLimiter: vi.fn().mockReturnValue(async (_c: Context, next: Next) => {
    await next();
  }),
  globalRateLimitMW: async (_c: Context, next: Next) => {
    await next();
  },
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
    find: (...args: unknown[]) => findMock(...args),
    create: vi.fn(),
  },
}));

// Stub the auth handler so importing the main router does not boot Better Auth.
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
      id: "row_known",
      event: "user.created",
      actorId: "usr_actor",
      actorType: "user",
      targetId: "usr_target",
      targetType: "user",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
      metadata: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    const unknownRow = {
      ...baseRow,
      id: "row_unknown",
      event: "legacy.unknown.event",
    };

    findMock.mockResolvedValueOnce({
      data: [baseRow, unknownRow],
      meta: { total: 2, page: 1, perPage: 20, pageCount: 1 },
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
      { id: "r1", event: "auth.login.success" },
      { id: "r2", event: "role.assigned" },
    ];
    const rows = knownEvents.map((e) => ({
      ...e,
      actorId: null,
      actorType: "user",
      targetId: null,
      targetType: null,
      ipAddress: null,
      userAgent: null,
      metadata: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    }));

    findMock.mockResolvedValueOnce({
      data: rows,
      meta: { total: 2, page: 1, perPage: 20, pageCount: 1 },
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

  it("subtracts dropped rows from meta.total so data.length and meta stay in sync", async () => {
    findMock.mockResolvedValueOnce({
      data: [
        {
          id: "r_keep",
          event: "user.viewed",
          actorId: null,
          actorType: "user",
          targetId: null,
          targetType: null,
          ipAddress: null,
          userAgent: null,
          metadata: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          id: "r_drop",
          event: "unknown.event",
          actorId: null,
          actorType: "user",
          targetId: null,
          targetType: null,
          ipAddress: null,
          userAgent: null,
          metadata: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
      meta: { total: 2, page: 1, perPage: 20, pageCount: 1 },
    });

    const response = await auditLogsHandler.request(
      "http://localhost/?page=1&perPage=20"
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as ListResponseBody;
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
    expect(body.meta.pageCount).toBe(1);
  });
});
