import "@fontsource-variable/inter/index.css";
import "@fontsource-variable/inter/wght-italic.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import AppError from "@/modules/common/app-error";
import { FullPageLoadingState } from "@/modules/common/full-page-loading-state";
import { queryClient } from "@/query/query-client";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  context: {
    queryClient,
    // Session is resolved per-navigation by route beforeLoad hooks, never at
    // boot: awaiting it here would blank-screen every cold load and freeze a
    // stale session for the lifetime of the tab.
    session: null,
  },
  defaultErrorComponent: AppError,
  defaultHashScrollIntoView: { behavior: "smooth" },
  defaultPendingComponent: () => <FullPageLoadingState />,
  defaultPendingMinMs: 0,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  routeTree,
  scrollRestoration: true,
  scrollRestorationBehavior: "smooth",
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
  ReactDOM.createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
