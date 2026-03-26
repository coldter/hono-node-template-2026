import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "@/api.gen/sdk.gen";
import type { ListAuditLogsData } from "@/api.gen/types.gen";

export type AuditLogsQueryParams = NonNullable<ListAuditLogsData["query"]>;

export function useAuditLogsQuery(params: AuditLogsQueryParams) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: async () => {
      const response = await listAuditLogs({ query: params });
      return response;
    },
    placeholderData: (prev) => prev,
  });
}
