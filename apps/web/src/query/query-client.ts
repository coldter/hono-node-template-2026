import {
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import { handleGlobalError, handleGlobalSuccess } from "./on-error";

function syncOnlineStatus() {
  onlineManager.setOnline(navigator.onLine);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", syncOnlineStatus);
  window.addEventListener("offline", syncOnlineStatus);
  syncOnlineStatus();
}

const cacheConfig = {
  onError: handleGlobalError,
  onSuccess: handleGlobalSuccess,
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache(cacheConfig),
  mutationCache: new MutationCache(cacheConfig),
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 10,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
