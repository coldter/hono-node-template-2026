import { createFileRoute, redirect } from "@tanstack/react-router";
// Deep import: the auth barrel would pull framer-motion into this eagerly
// evaluated route file (beforeLoad is not extracted by autoCodeSplitting).
import { clearSession } from "@/modules/auth/helpers";
import { AuthenticatedLayout } from "@/modules/layout/authenticated-layout";
import { sessionQueryOptions } from "@/query/session-query";
import { useAlertStore } from "@/store/alert";
import { useUserStore } from "@/store/user";

export const Route = createFileRoute("/(protected)")({
  beforeLoad: async ({ context, location }) => {
    const session =
      await context.queryClient.ensureQueryData(sessionQueryOptions);

    if (!session) {
      const previousUser = useUserStore.getState().user;

      if (previousUser) {
        useAlertStore.getState().setDownAlert("session_invalidated");
        clearSession();
      }

      throw redirect({
        search: {
          redirect: location.href,
        },
        to: "/login",
      });
    }

    useUserStore.getState().setUser(session.user);

    return {
      session,
    };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return <AuthenticatedLayout />;
}
