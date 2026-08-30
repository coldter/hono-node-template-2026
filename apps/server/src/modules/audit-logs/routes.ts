import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";

import {
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

const auditLogsRoutes = {
  listAuditLogs: createRouteConfig({
    description: "Returns a paginated list of audit logs with optional filters",
    guard: [authorize("audit-log", "list")],
    method: "get",
    operationId: "listAuditLogs",
    path: "/",
    request: { query: listAuditLogsQuerySchema },
    responses: {
      200: {
        content: {
          "application/json": { schema: listAuditLogsResponseSchema },
        },
        description: "Audit logs",
      },
      ...commonErrorResponses,
    },
    summary: "List audit logs",
    tags: ["audit-logs"],
  }),
} as const;

export default auditLogsRoutes;
