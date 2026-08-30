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
              "@container/content",

              "has-data-[layout=fixed]:h-svh",

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
