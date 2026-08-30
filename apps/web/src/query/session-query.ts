import { queryOptions } from "@tanstack/react-query";
import { authClient, type Session } from "@/lib/auth-client";

export type { Session };

export const sessionQueryOptions = queryOptions({
  gcTime: 5 * 60_000,
  queryFn: async (): Promise<Session | null> => {
    const { data } = await authClient.getSession();
    return data ?? null;
  },
  queryKey: ["session"] as const,
  staleTime: 60_000,
});
