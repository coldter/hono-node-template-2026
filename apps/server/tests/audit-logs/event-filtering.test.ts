import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuditLog } from "@repo/db/schema";
import { buildAuthorizationPrincipal } from "@repo/shared/authorization";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Env } from "@/lib/context";
import { createAuditLogsHandler } from "@/modules/audit-logs/handler";
import type { auditLogService } from "@/modules/audit-logs/service";

const findMock = vi.fn<typeof auditLogService.find>();

const adminPrincipal = buildAuthorizationPrincipal({
  id: "usr_admin",
  roleSlugs: ["admin"],
  status: "active",
});

function createApp() {
  const app = new OpenAPIHono<Env>();

  app.use(async (c, next) => {
    c.set("principal", adminPrincipal);
    await next();
  });
  app.route("/", createAuditLogsHandler({ find: findMock }));

  return app;
}

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
} satisfies AuditLog;

function droppedEventRow(id: string): AuditLog {
  const legacyEvent: string = "legacy.unknown.event";

  // SAFETY: stored audit rows can carry event keys from a newer deploy than this build's enum; dropping that drift is the behavior under test.
  return { ...baseRow, event: legacyEvent, id } as AuditLog;
}

const responseBodySchema = z.object({
  data: z.array(z.object({ event: z.string(), id: z.string() })),
  meta: z.object({
    page: z.number(),
    pageCount: z.number(),
    perPage: z.number(),
    total: z.number(),
  }),
});

beforeEach(() => {
  findMock.mockReset();
});

describe("audit-logs handler event filtering", () => {
  it("should drop rows with unknown event keys and keep the server-reported total", async () => {
    findMock.mockResolvedValueOnce({
      data: [baseRow, droppedEventRow("row_unknown")],
      meta: {
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        page: 1,
        pageCount: 1,
        perPage: 20,
        prevPage: null,
        total: 2,
      },
    });

    const response = await createApp().request("/?page=1&perPage=20");

    expect(response.status).toBe(200);
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: 20 })
    );

    const body = responseBodySchema.parse(await response.json());
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe("row_known");
    expect(body.data[0]?.event).toBe("user.created");
    expect(body.meta.total).toBe(2);
    expect(body.meta.pageCount).toBe(1);
  });
});
