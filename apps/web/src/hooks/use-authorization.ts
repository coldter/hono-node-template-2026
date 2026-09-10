import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getAuthorizationCapabilities } from "@/api.gen/sdk.gen";

const EMPTY_CAPABILITIES: Record<string, boolean> = {};

export const capabilitiesQueryOptions = queryOptions({
  queryFn: async () => {
    const response = await getAuthorizationCapabilities();
    return response.capabilities;
  },
  queryKey: ["authorization", "capabilities"],
  retry: 1,
  staleTime: 60 * 1000,
});

export function useAuthorization() {
  const query = useQuery(capabilitiesQueryOptions);

  const capabilities = useMemo(
    () => query.data ?? EMPTY_CAPABILITIES,
    [query.data]
  );

  return {
    capabilities,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
