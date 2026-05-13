import { OpenAPIHono } from "@hono/zod-openapi";

import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";
import auditLogsRoutes from "./routes";
import { auditLogService } from "./service";
import type { AuditEventKey } from "./types";

const app = new OpenAPIHono<Env>({ defaultHook });

const auditLogsHandler = app.openapi(
  auditLogsRoutes.listAuditLogs,
  async (c) => {
    const query = c.req.valid("query");
    const result = await auditLogService.find(query);

    return c.json(
      {
        data: result.data.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
          event: log.event as AuditEventKey,
        })),
        meta: result.meta,
      },
      200
    );
  }
);

export default auditLogsHandler;
