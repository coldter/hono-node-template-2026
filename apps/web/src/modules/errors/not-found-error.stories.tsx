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
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  component: NotFoundError,
  parameters: {
    docs: {
      description: {
        component: "404 full-page view for unknown routes.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Errors/NotFoundError",
} satisfies Meta<typeof NotFoundError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
