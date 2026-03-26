import { queryOptions } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useAlertStore } from "@/store/alert";
import { useUserStore } from "@/store/user";
import type { Session } from "./types";

export const authKeys = {
  all: ["auth"] as const,
  session: ["auth", "session"] as const,
  user: ["auth", "user"] as const,
} as const;

export const sessionQueryOptions = () =>
  queryOptions<Session | null>({
    queryKey: authKeys.session,
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      if (error) {
        throw error;
      }

      const previousUser = useUserStore.getState().user;

      if (!data && previousUser) {
        useAlertStore.getState().setDownAlert("session_invalidated");
      }

      return data;
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: true,
  });
