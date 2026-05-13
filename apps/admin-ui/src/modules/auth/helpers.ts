import { queryClient } from "@/query/query-client";
import { useUserStore } from "@/store/user";

export const clearSession = () => {
  queryClient.clear();
  useUserStore.getState().clearUser();
};
