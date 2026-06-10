import { createFileRoute } from "@tanstack/react-router";
// zod/mini: autoCodeSplitting cannot extract validateSearch, so classic zod
// here would ship in the eager entry chunk for every visitor.
import * as z from "zod/mini";

import { Authorized } from "@/components/authorized";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";
import { AuditLogs } from "@/modules/audit-logs";
import { auditLogsListQueryOptions } from "@/modules/audit-logs/query";
import { PermissionDenied } from "@/modules/permissions";

export const auditLogsSearchSchema = z.object({
  page: z.catch(z.optional(z.number()), 1),
  perPage: z.catch(z.optional(z.number()), 20),
  sort: z.optional(z.string()),
  order: z.optional(z.enum(["asc", "desc"])),
  event: z.optional(z.string()),
  actorId: z.optional(z.string()),
  targetType: z.optional(z.enum(["user", "role", "session"])),
});

export type AuditLogsSearch = z.infer<typeof auditLogsSearchSchema>;

// Must mirror AuditLogsTable's useTableUrlState derivation exactly; a different
// params object changes the query key and the loader's fetch is wasted.
function auditLogsListParams(search: AuditLogsSearch) {
  return {
    page: Math.max(1, search.page ?? 1),
    // useTableUrlState reads the "pageSize" search key, which this schema does
    // not define, so the table always fetches the default page size.
    perPage: 20,
    sort: search.sort ?? "createdAt",
    order: search.order ?? ("desc" as const),
    event: search.event,
    actorId: search.actorId,
    targetType: search.targetType,
  };
}

export const Route = createFileRoute("/(protected)/audit-logs/")({
  validateSearch: (search) => auditLogsSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    // prefetchQuery (not ensureQueryData) so fetch failures keep rendering the
    // inline TableError instead of replacing the page with the errorComponent.
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
  component: () => (
    <Authorized
      capability="audit-log:list"
      fallback={<PermissionDenied requiredPermission="audit-log:list" />}
    >
      <AuditLogs />
    </Authorized>
  ),
});
