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
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  component: ForbiddenError,
  parameters: {
    docs: {
      description: {
        component:
          "403 page shown when the user is authenticated but lacks permission for the resource.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Errors/Forbidden",
} satisfies Meta<typeof ForbiddenError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
