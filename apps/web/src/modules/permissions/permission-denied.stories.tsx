import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { PermissionDenied } from "./permission-denied";

type StoryArgs = React.ComponentProps<typeof PermissionDenied>;

function renderWithProviders(args: StoryArgs) {
  const client = new QueryClient();
  const rootRoute = createRootRoute({
    component: () => <PermissionDenied {...args} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Permissions/PermissionDenied",
  component: PermissionDenied,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full-page permission denied screen. Supports back/home/logout actions and an optional required permission badge.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PermissionDenied>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithProviders({}),
};

export const WithRequiredPermission: Story = {
  render: () =>
    renderWithProviders({
      title: "Admin only",
      message: "This page is restricted to workspace administrators.",
      requiredPermission: "workspace:admin",
    }),
};

export const WithLogoutAction: Story = {
  render: () =>
    renderWithProviders({
      showLogoutButton: true,
      message:
        "Your current account does not have access. Try signing in with a different one.",
    }),
};
