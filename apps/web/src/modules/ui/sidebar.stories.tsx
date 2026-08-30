import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Home,
  Inbox,
  type LucideIcon,
  Search,
  Settings,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar";

const meta = {
  component: Sidebar,
  parameters: {
    docs: {
      description: {
        component:
          "Full-page application sidebar with SidebarProvider, Sidebar composition, SidebarInset for main content, and keyboard shortcut support. Supports variant=sidebar|floating|inset and collapsible=offcanvas|icon|none.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "UI/Sidebar",
} satisfies Meta<typeof Sidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

type NavItem = { title: string; icon: LucideIcon };

const navItems: NavItem[] = [
  { icon: Home, title: "Home" },
  { icon: Inbox, title: "Inbox" },
  { icon: Search, title: "Search" },
  { icon: Users, title: "Team" },
  { icon: Settings, title: "Settings" },
];

function DemoSidebar({
  variant = "sidebar",
  collapsible = "offcanvas",
}: {
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  return (
    <div className="h-screen">
      <SidebarProvider>
        <Sidebar collapsible={collapsible} variant={variant}>
          <SidebarHeader>
            <div className="px-2 py-1.5 font-semibold text-sm">Acme Inc.</div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton tooltip={item.title}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 py-1.5 text-muted-foreground text-xs">
              v1.0.0
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <div className="font-medium text-sm">Dashboard</div>
          </header>
          <main className="p-6">
            <h1 className="font-semibold text-xl">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Use the trigger to toggle the sidebar, or press Ctrl/Cmd+B.
            </p>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

export const Default: Story = {
  render: () => <DemoSidebar />,
};

export const Floating: Story = {
  render: () => <DemoSidebar variant="floating" />,
};

export const Inset: Story = {
  render: () => <DemoSidebar variant="inset" />,
};

export const CollapsibleIcon: Story = {
  render: () => <DemoSidebar collapsible="icon" />,
};

export const CollapsibleOffcanvas: Story = {
  render: () => <DemoSidebar collapsible="offcanvas" />,
};
