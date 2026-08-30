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
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  component: GeneralError,
  parameters: {
    docs: {
      description: {
        component:
          "500 fallback. Full variant shows icon, code, and navigation buttons; `minimal` strips decoration for inline use.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Errors/GeneralError",
} satisfies Meta<typeof GeneralError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithRouter(false),
};

export const Minimal: Story = {
  render: () => renderWithRouter(true),
};
