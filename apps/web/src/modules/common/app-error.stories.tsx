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
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  args: {
    error: new Error("Placeholder"),
    info: { componentStack: "" },
    reset: () => undefined,
  },
  component: AppError,
  parameters: {
    docs: {
      description: {
        component:
          "Top-level error boundary UI. Shows a user-facing message, a stack trace in non-dev builds, and actions to retry or return home.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Common/AppError",
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
