import { Link } from "@tanstack/react-router";
import { Logo } from "@/assets/logo";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/modules/ui/sidebar";

export function AppTitle() {
  const { setOpenMobile, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          className="gap-0 py-0 hover:bg-transparent active:bg-transparent"
          size="lg"
        >
          <div className="flex items-center w-full">
            <Logo className={cn("size-6", isCollapsed ? "mx-auto" : "mr-2")} />
            {!isCollapsed && (
              <Link
                className="flex-1 text-start"
                onClick={() => setOpenMobile(false)}
                to="/"
              >
                <div className="flex flex-col">
                  <span className="font-bold text-sm">Shadcn-Admin</span>
                  <span className="text-xs text-muted-foreground truncate">
                    Vite + ShadcnUI
                  </span>
                </div>
              </Link>
            )}
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
