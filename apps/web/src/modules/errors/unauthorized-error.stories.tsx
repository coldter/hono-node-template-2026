import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { UnauthorisedError } from "./unauthorized-error";

function renderWithRouter() {
  const rootRoute = createRootRoute({ component: UnauthorisedError });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  component: UnauthorisedError,
  parameters: {
    docs: {
      description: {
        component:
          "401 full-page view shown when a session is required but missing or invalid.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Errors/UnauthorizedError",
} satisfies Meta<typeof UnauthorisedError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
