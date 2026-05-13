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
  { href: "/settings", title: "Profile", icon: <User size={16} /> },
  {
    href: "/settings/notifications",
    title: "Notifications",
    icon: <Bell size={16} />,
  },
  {
    href: "/settings/billing",
    title: "Billing",
    icon: <CreditCard size={16} />,
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
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Features/Settings/SidebarNav",
  component: SidebarNav,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Responsive settings nav. Renders a horizontal/vertical link list on desktop and collapses to a Select on mobile.",
      },
    },
  },
  tags: ["autodocs"],
  args: {
    items,
  },
} satisfies Meta<typeof SidebarNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
