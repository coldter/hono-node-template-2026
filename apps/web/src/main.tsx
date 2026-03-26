import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import AppError from "@/modules/common/app-error";
import { FullPageLoadingState } from "@/modules/common/full-page-loading-state";
import type { RouterAppContext } from "@/routes/__root";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: "smooth",
  defaultHashScrollIntoView: { behavior: "smooth" },
  routeTree,
  defaultPendingComponent: () => <FullPageLoadingState />,
  defaultErrorComponent: AppError,
  context: {
    session: undefined,
  } satisfies RouterAppContext,
  defaultPendingMinMs: 0,
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
  root.render(<RouterProvider router={router} />);
}
