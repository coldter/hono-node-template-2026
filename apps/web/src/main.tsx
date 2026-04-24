import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import type { Session } from "@/lib/auth-client";
import AppError from "@/modules/common/app-error";
import { FullPageLoadingState } from "@/modules/common/full-page-loading-state";
import { queryClient } from "@/query/query-client";
import { sessionQueryOptions } from "@/query/session-query";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: "smooth",
  defaultHashScrollIntoView: { behavior: "smooth" },
  routeTree,
  defaultPendingComponent: () => <FullPageLoadingState />,
  defaultErrorComponent: AppError,
  context: {
    queryClient,
    session: null,
  },
  defaultPendingMinMs: 0,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);

  const bootstrap = async () => {
    let session: Session | null = null;
    try {
      session = await queryClient.ensureQueryData(sessionQueryOptions);
    } catch (error) {
      console.error("Failed to bootstrap session:", error);
    }

    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider context={{ queryClient, session }} router={router} />
      </QueryClientProvider>
    );
  };

  bootstrap();
}
