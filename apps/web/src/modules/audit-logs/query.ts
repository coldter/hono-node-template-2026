import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "@/api.gen/sdk.gen";
import type { ListAuditLogsData } from "@/api.gen/types.gen";

export type AuditLogsQueryParams = NonNullable<ListAuditLogsData["query"]>;

export const auditLogsKeys = {
  all: ["audit-logs"] as const,
  lists: () => [...auditLogsKeys.all, "list"] as const,
  list: (params: AuditLogsQueryParams) =>
    [...auditLogsKeys.lists(), params] as const,
};

export function useAuditLogsQuery(params: AuditLogsQueryParams) {
  return useQuery({
    queryKey: auditLogsKeys.list(params),
    queryFn: async ({ signal }) => {
      const response = await listAuditLogs({ query: params, signal });
      return response;
    },
    placeholderData: (prev) => prev,
  });
}
