import {
  Bell,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Palette,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import type { SidebarData } from "@/modules/layout/types";

export const sidebarData: SidebarData = {
  navGroups: [
    {
      items: [
        {
          icon: LayoutDashboard,
          title: "Dashboard",
          url: "/dashboard",
        },
      ],
      title: "General",
    },
    {
      items: [
        {
          icon: Users,
          permission: "user:list",
          title: "Users",
          url: "/users",
        },
        {
          icon: FileText,
          permission: "audit-log:list",
          title: "Audit Logs",
          url: "/audit-logs",
        },
      ],
      title: "System",
    },
    {
      items: [
        {
          icon: Settings,
          items: [
            {
              icon: UserCog,
              title: "Profile",
              url: "/settings",
            },
            {
              icon: Palette,
              title: "Appearance",
              url: "/settings/appearance",
            },
            {
              icon: Bell,
              title: "Notifications",
              url: "/settings/notifications",
            },
          ],
          title: "Settings",
        },
        {
          icon: HelpCircle,
          title: "Help Center",
          url: "/help-center",
        },
      ],
      title: "Other",
    },
  ],
  user: {
    avatar: "",
    email: "",
    name: "",
  },
};
