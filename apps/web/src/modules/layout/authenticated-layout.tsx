import { Outlet } from "@tanstack/react-router";
import { LayoutProvider } from "@/context/layout-provider";
import { SearchProvider } from "@/context/search-provider";
import { cn } from "@/lib/utils";
import { SkipToMain } from "@/modules/common/skip-to-main";
import { AppSidebar } from "@/modules/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/modules/ui/sidebar";
import { useUIStore } from "@/store";

type AuthenticatedLayoutProps = {
  children?: React.ReactNode;
};

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = useUIStore((state) => state.sidebarOpen);
  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              // Set content container, so we can use container queries
              "@container/content",

              // If layout is fixed, set the height
              // to 100svh to prevent overflow
              "has-data-[layout=fixed]:h-svh",

              // If layout is fixed and sidebar is inset,
              // set the height to 100svh - spacing (total margins) to prevent overflow
              "peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]"
            )}
          >
            {children ?? <Outlet />}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  );
}
