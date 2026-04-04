import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";

import {
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

const auditLogsRoutes = {
  listAuditLogs: createRouteConfig({
    operationId: "listAuditLogs",
    method: "get",
    path: "/",
    guard: [authorize("audit-log", "list")],
    tags: ["audit-logs"],
    summary: "List audit logs",
    description: "Returns a paginated list of audit logs with optional filters",
    request: { query: listAuditLogsQuerySchema },
    responses: {
      200: {
        description: "Audit logs",
        content: {
          "application/json": { schema: listAuditLogsResponseSchema },
        },
      },
      ...commonErrorResponses,
    },
  }),
} as const;

export default auditLogsRoutes;
