import { queryOptions, useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "@/api.gen/sdk.gen";
import type { ListAuditLogsData } from "@/api.gen/types.gen";

export type AuditLogsQueryParams = NonNullable<ListAuditLogsData["query"]>;

export const auditLogsKeys = {
  all: ["audit-logs"] as const,
  lists: () => [...auditLogsKeys.all, "list"] as const,
  list: (params: AuditLogsQueryParams) =>
    [...auditLogsKeys.lists(), params] as const,
};

export function auditLogsListQueryOptions(params: AuditLogsQueryParams) {
  return queryOptions({
    queryKey: auditLogsKeys.list(params),
    queryFn: async ({ signal }) => {
      const response = await listAuditLogs({ query: params, signal });
      return response;
    },
  });
}

export function useAuditLogsQuery(params: AuditLogsQueryParams) {
  return useQuery({
    ...auditLogsListQueryOptions(params),
    placeholderData: (prev) => prev,
  });
}
