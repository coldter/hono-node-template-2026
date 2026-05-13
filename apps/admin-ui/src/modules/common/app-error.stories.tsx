import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import AppError from "./app-error";

function StoryRouter({ error }: { error: Error }) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <AppError
          error={error}
          info={{ componentStack: "" }}
          reset={() => undefined}
        />
      </>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Common/AppError",
  component: AppError,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Top-level error boundary UI. Shows a user-facing message, a stack trace in non-dev builds, and actions to retry or return home.",
      },
    },
  },
  tags: ["autodocs"],
  args: {
    error: new Error("Placeholder"),
    reset: () => undefined,
    info: { componentStack: "" },
  },
} satisfies Meta<typeof AppError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <StoryRouter error={new Error("Failed to fetch user profile")} />
  ),
};

export const WithStack: Story = {
  render: () => {
    const err = new Error("Unexpected token in JSON at position 42");
    err.stack =
      "Error: Unexpected token in JSON at position 42\n    at parseResponse (api.ts:112:9)\n    at fetchUser (api.ts:48:22)";
    return <StoryRouter error={err} />;
  },
};
