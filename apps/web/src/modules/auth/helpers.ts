import { queryClient } from "@/query/query-client";
import { sessionQueryOptions } from "@/query/session-query";
import { useUserStore } from "@/store/user";

export const clearSession = () => {
  useUserStore.getState().clearUser();
  queryClient.clear();
};

export const resetSessionQuery = () => {
  queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey });
};
