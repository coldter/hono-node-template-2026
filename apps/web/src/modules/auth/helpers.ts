import { queryClient } from "@/query/query-client";
import { sessionQueryOptions } from "@/query/session-query";
import { useUserStore } from "@/store/user";

export const clearSession = () => {
  // Clear the user store first: the global 401 handler uses it to tell
  // intentional sign-out apart from genuine session expiry, and clear()
  // triggers refetches on mounted observers that will 401 after sign-out.
  useUserStore.getState().clearUser();
  queryClient.clear();
};

// The login/signup routes probe the session in beforeLoad and cache null with
// a 60s staleTime; after a successful sign-in that stale null would bounce the
// protected route's guard straight back to /login. Drop it so the next
// ensureQueryData refetches.
export const resetSessionQuery = () => {
  queryClient.removeQueries({ queryKey: sessionQueryOptions.queryKey });
};
