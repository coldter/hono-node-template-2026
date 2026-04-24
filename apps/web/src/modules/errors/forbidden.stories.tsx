import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ForbiddenError } from "./forbidden";

function renderWithRouter() {
  const rootRoute = createRootRoute({ component: ForbiddenError });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Errors/Forbidden",
  component: ForbiddenError,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "403 page shown when the user is authenticated but lacks permission for the resource.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ForbiddenError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
