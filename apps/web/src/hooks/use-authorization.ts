import { useQuery } from "@tanstack/react-query";
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

export function useAuthorization() {
  const query = useQuery({
    queryKey: ["authorization", "capabilities"],
    queryFn: async () => {
      const response = await getAuthorizationCapabilities();
      return normalizeCapabilities(response.capabilities);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    capabilities: query.data ?? {},
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
