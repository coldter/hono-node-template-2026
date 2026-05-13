import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { GeneralError } from "./general-error";

function renderWithRouter(minimal = false) {
  const rootRoute = createRootRoute({
    component: () => <GeneralError minimal={minimal} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Errors/GeneralError",
  component: GeneralError,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "500 fallback. Full variant shows icon, code, and navigation buttons; `minimal` strips decoration for inline use.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof GeneralError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(false),
};

export const Minimal: Story = {
  render: () => renderWithRouter(true),
};
