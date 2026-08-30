import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { TopNav } from "./top-nav";

const links = [
  { href: "/", isActive: true, title: "Overview" },
  { href: "/customers", isActive: false, title: "Customers" },
  { href: "/products", isActive: false, title: "Products" },
  { disabled: true, href: "/settings", isActive: false, title: "Settings" },
];

function renderWithRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <div className="flex items-center gap-4 border-b bg-background p-4">
        <TopNav links={links} />
      </div>
    ),
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  args: {
    links,
  },
  component: TopNav,
  parameters: {
    docs: {
      description: {
        component:
          "Horizontal navigation used in authenticated layouts. Collapses to a dropdown on small screens and marks the active link.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Features/Layout/TopNav",
} satisfies Meta<typeof TopNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
