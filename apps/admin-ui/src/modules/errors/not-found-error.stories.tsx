import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { NotFoundError } from "./not-found-error";

function renderWithRouter() {
  const rootRoute = createRootRoute({ component: NotFoundError });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Errors/NotFoundError",
  component: NotFoundError,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "404 full-page view for unknown routes.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof NotFoundError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
