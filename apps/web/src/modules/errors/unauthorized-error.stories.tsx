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
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Errors/UnauthorizedError",
  component: UnauthorisedError,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "401 full-page view shown when a session is required but missing or invalid.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof UnauthorisedError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(),
};
