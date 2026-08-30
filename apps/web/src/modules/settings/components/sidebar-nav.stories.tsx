import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Bell, CreditCard, User } from "lucide-react";
import { SidebarNav } from "./sidebar-nav";

const items = [
  { href: "/settings", icon: <User size={16} />, title: "Profile" },
  {
    href: "/settings/notifications",
    icon: <Bell size={16} />,
    title: "Notifications",
  },
  {
    href: "/settings/billing",
    icon: <CreditCard size={16} />,
    title: "Billing",
  },
];

function renderWithRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <div className="w-60 border-r p-4">
        <SidebarNav items={items} />
      </div>
    ),
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  args: {
    items,
  },
  component: SidebarNav,
  parameters: {
    docs: {
      description: {
        component:
          "Responsive settings nav. Renders a horizontal/vertical link list on desktop and collapses to a Select on mobile.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Features/Settings/SidebarNav",
} satisfies Meta<typeof SidebarNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
