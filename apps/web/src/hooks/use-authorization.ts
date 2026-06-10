import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getAuthorizationCapabilities } from "@/api.gen/sdk.gen";

function normalizeCapabilities(capabilities: unknown): Record<string, boolean> {
  if (!capabilities || typeof capabilities !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(capabilities).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean"
    )
  );
}

export const capabilitiesQueryOptions = queryOptions({
  queryKey: ["authorization", "capabilities"],
  queryFn: async () => {
    const response = await getAuthorizationCapabilities();
    return normalizeCapabilities(response.capabilities);
  },
  staleTime: 5 * 60 * 1000,
  retry: 1,
});

export function useAuthorization() {
  const query = useQuery(capabilitiesQueryOptions);

  const capabilities = useMemo(() => query.data ?? {}, [query.data]);

  return {
    capabilities,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
