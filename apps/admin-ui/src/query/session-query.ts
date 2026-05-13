import { queryOptions } from "@tanstack/react-query";
import { authClient, type Session } from "@/lib/auth-client";

export type { Session };

export const sessionQueryOptions = queryOptions({
  queryKey: ["session"] as const,
  queryFn: async (): Promise<Session | null> => {
    const { data } = await authClient.getSession();
    return data ?? null;
  },
  staleTime: 60_000,
  gcTime: 5 * 60_000,
});
