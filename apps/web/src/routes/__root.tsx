import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "@/context/theme-provider";
import type { Session } from "@/modules/auth";
import AppError from "@/modules/common/app-error";
import { DownAlert } from "@/modules/common/down-alert";
import { NavigationProgress } from "@/modules/common/navigation-progress";
import { Toaster } from "@/modules/ui/sonner";
import { QueryClientProvider } from "@/query";
import "../index.css";
import { StrictMode } from "react";

export type RouterAppContext = {
  session?: Session | null;
};

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: () => <Navigate to="/login" />,
  errorComponent: AppError,
  head: () => ({
    meta: [
      {
        title: "App",
      },
      {
        name: "description",
        content: "Web application",
      },
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <StrictMode>
      <HeadContent />
      <QueryClientProvider>
        <ThemeProvider defaultTheme="light">
          <NavigationProgress />
          <div className="flex min-h-svh flex-col">
            <main className="flex-1">
              <Outlet />
            </main>
          </div>
          <Toaster richColors />
          <DownAlert />
        </ThemeProvider>
        <ReactQueryDevtools initialIsOpen={false} />
        <TanStackRouterDevtools position="bottom-left" />
      </QueryClientProvider>
    </StrictMode>
  );
}
