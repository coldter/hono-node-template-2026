import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { TopNav } from "./top-nav";

const links = [
  { title: "Overview", href: "/", isActive: true },
  { title: "Customers", href: "/customers", isActive: false },
  { title: "Products", href: "/products", isActive: false },
  { title: "Settings", href: "/settings", isActive: false, disabled: true },
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
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Features/Layout/TopNav",
  component: TopNav,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Horizontal navigation used in authenticated layouts. Collapses to a dropdown on small screens and marks the active link.",
      },
    },
  },
  tags: ["autodocs"],
  args: {
    links,
  },
} satisfies Meta<typeof TopNav>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
