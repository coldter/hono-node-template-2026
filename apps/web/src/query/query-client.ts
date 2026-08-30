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
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 1000 * 30,
    },
  },
  mutationCache: new MutationCache(cacheConfig),
  queryCache: new QueryCache(cacheConfig),
});
