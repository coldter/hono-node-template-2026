import { OpenAPIHono } from "@hono/zod-openapi";

import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";
import { createPaginatedResponse } from "@/utils/pagination";
import auditLogsRoutes from "./routes";
import { auditEventKeySchema } from "./schema";
import { auditLogService } from "./service";

export function createAuditLogsHandler(
  service: Pick<typeof auditLogService, "find">
) {
  const app = new OpenAPIHono<Env>({ defaultHook });

  return app.openapi(auditLogsRoutes.listAuditLogs, async (c) => {
    const query = c.req.valid("query");
    const result = await service.find(query);

    type AuditLogRow = (typeof result.data)[number];
    const formatAuditLog = (log: AuditLogRow) => {
      const parsedEvent = auditEventKeySchema.safeParse(log.event);
      if (!parsedEvent.success) {
        return null;
      }
      return {
        ...log,
        createdAt: log.createdAt.toISOString(),
        event: parsedEvent.data,
      };
    };

    const paginated = createPaginatedResponse({
      data: result.data,
      formatter: formatAuditLog,
      query,
      total: result.meta.total,
    });

    return c.json(paginated, 200);
  });
}

const auditLogsHandler = createAuditLogsHandler(auditLogService);

export default auditLogsHandler;
