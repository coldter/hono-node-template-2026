import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  createRootRouteWithContext,
  HeadContent,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { StrictMode } from "react";
import { ThemeProvider } from "@/context/theme-provider";
import type { Session } from "@/lib/auth-client";
import { brand } from "@/lib/brand";
import { initErrorReporting } from "@/lib/report-error";
import AppError from "@/modules/common/app-error";
import { DownAlert } from "@/modules/common/down-alert";
import { NavigationProgress } from "@/modules/common/navigation-progress";
import { Toaster } from "@/modules/ui/sonner";
import "../index.css";

export type RouterAppContext = {
  queryClient: QueryClient;
  session: Session | null;
};

initErrorReporting();

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: () => <Navigate to="/login" />,
  errorComponent: AppError,
  head: () => ({
    meta: [
      {
        title: brand.appName,
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
    </StrictMode>
  );
}
