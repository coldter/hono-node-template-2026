import {
  Bell,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Monitor,
  Palette,
  Settings,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import type { SidebarData } from "@/modules/layout/types";

export const sidebarData: SidebarData = {
  user: {
    name: "",
    email: "",
    avatar: "",
  },
  navGroups: [
    {
      title: "General",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: "System",
      items: [
        {
          title: "Users",
          url: "/users",
          icon: Users,
          permission: "user:list",
        },
        {
          title: "Audit Logs",
          url: "/audit-logs",
          icon: FileText,
          permission: "audit-log:list",
        },
      ],
    },
    {
      title: "Other",
      items: [
        {
          title: "Settings",
          icon: Settings,
          items: [
            {
              title: "Profile",
              url: "/settings",
              icon: UserCog,
            },
            {
              title: "Account",
              url: "/settings/account",
              icon: Wrench,
            },
            {
              title: "Appearance",
              url: "/settings/appearance",
              icon: Palette,
            },
            {
              title: "Notifications",
              url: "/settings/notifications",
              icon: Bell,
            },
            {
              title: "Display",
              url: "/settings/display",
              icon: Monitor,
            },
          ],
        },
        {
          title: "Help Center",
          url: "/help-center",
          icon: HelpCircle,
        },
      ],
    },
  ],
};
