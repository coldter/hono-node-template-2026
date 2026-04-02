import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { Authorized } from "@/components/authorized";
import { AuditLogs } from "@/modules/audit-logs";
import { PermissionDenied } from "@/modules/permissions";

export const auditLogsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  perPage: z.number().optional().catch(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  event: z.string().optional(),
  actorId: z.string().optional(),
  targetType: z.enum(["user", "role", "session"]).optional(),
});

export type AuditLogsSearch = z.infer<typeof auditLogsSearchSchema>;

export const Route = createFileRoute("/(protected)/audit-logs/")({
  validateSearch: (search) => auditLogsSearchSchema.parse(search),
  component: () => (
    <Authorized
      capability="audit-log:list"
      fallback={<PermissionDenied requiredPermission="audit-log:list" />}
    >
      <AuditLogs />
    </Authorized>
  ),
});
