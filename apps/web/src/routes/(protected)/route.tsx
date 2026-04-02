import { createFileRoute, redirect } from "@tanstack/react-router";
import { clearSession, sessionQueryOptions } from "@/modules/auth";
import { AuthenticatedLayout } from "@/modules/layout/authenticated-layout";
import { queryClient } from "@/query/query-client";
import { useAlertStore } from "@/store/alert";
import { useUserStore } from "@/store/user";

export const Route = createFileRoute("/(protected)")({
  beforeLoad: async ({ location, cause }) => {
    if (cause !== "enter") {
      return;
    }

    try {
      const queryOptions = sessionQueryOptions();
      const cached = queryClient.getQueryData(queryOptions.queryKey);

      const session =
        cached === null
          ? await queryClient.fetchQuery({ ...queryOptions, staleTime: 0 })
          : await queryClient.ensureQueryData({
              ...queryOptions,
              revalidateIfStale: true,
            });

      if (!session) {
        const previousUser = useUserStore.getState().user;

        if (previousUser) {
          useAlertStore.getState().setDownAlert("session_invalidated");
          clearSession();
        }

        throw redirect({
          to: "/login",
          search: {
            redirect: location.pathname,
          },
        });
      }

      useUserStore.getState().setUser(session.user);

      return {
        session,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "redirect") {
        throw error;
      }

      console.error("Error fetching session:", error);

      throw redirect({
        to: "/login",
        search: {
          redirect: location.pathname,
        },
      });
    }
  },
  loader: async ({ context }) => context?.session ?? null,
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return <AuthenticatedLayout />;
}
