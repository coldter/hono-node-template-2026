import { commonErrorResponses } from "@/lib/common-resonse";
import { createRouteConfig } from "@/lib/route-config";
import { requirePermission } from "@/middlewares/guard";
import { PERMISSIONS } from "@/modules/auth/roles/permissions";

import {
  listAuditLogsQuerySchema,
  listAuditLogsResponseSchema,
} from "./schema";

const auditLogsRoutes = {
  listAuditLogs: createRouteConfig({
    operationId: "listAuditLogs",
    method: "get",
    path: "/",
    guard: [requirePermission(PERMISSIONS.AUDIT_LOGS.VIEW)],
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
