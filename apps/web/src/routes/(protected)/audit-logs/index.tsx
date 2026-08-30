import { createFileRoute } from "@tanstack/react-router";

import * as z from "zod/mini";

import { Authorized } from "@/components/authorized";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";
import { AuditLogs } from "@/modules/audit-logs";
import { auditLogsListQueryOptions } from "@/modules/audit-logs/query";
import { PermissionDenied } from "@/modules/permissions";

export const auditLogsSearchSchema = z.object({
  actorId: z.optional(z.string()),
  event: z.optional(z.string()),
  order: z.optional(z.enum(["asc", "desc"])),
  page: z.catch(z.optional(z.number()), 1),
  perPage: z.catch(z.optional(z.number()), 20),
  sort: z.optional(z.string()),
  targetType: z.optional(z.enum(["user", "role", "session"])),
});

export type AuditLogsSearch = z.infer<typeof auditLogsSearchSchema>;

function auditLogsListParams(search: AuditLogsSearch) {
  return {
    actorId: search.actorId,
    event: search.event,
    order: search.order ?? ("desc" as const),
    page: Math.max(1, search.page ?? 1),

    perPage: 20,
    sort: search.sort ?? "createdAt",
    targetType: search.targetType,
  };
}

export const Route = createFileRoute("/(protected)/audit-logs/")({
  component: () => (
    <Authorized
      capability="audit-log:list"
      fallback={<PermissionDenied requiredPermission="audit-log:list" />}
    >
      <AuditLogs />
    </Authorized>
  ),
  loader: async ({ context, deps }) => {
    const { queryClient } = context;

    await queryClient.prefetchQuery(capabilitiesQueryOptions);
    const capabilities = queryClient.getQueryData(
      capabilitiesQueryOptions.queryKey
    );
    if (capabilities?.["audit-log:list"]) {
      await queryClient.prefetchQuery(
        auditLogsListQueryOptions(auditLogsListParams(deps))
      );
    }
  },
  loaderDeps: ({ search }) => search,
  validateSearch: auditLogsSearchSchema,
});
