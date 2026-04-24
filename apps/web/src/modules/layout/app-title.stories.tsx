import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Sidebar, SidebarContent, SidebarProvider } from "@/modules/ui/sidebar";
import { AppTitle } from "./app-title";

function renderWithProviders() {
  const rootRoute = createRootRoute({
    component: () => (
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <AppTitle />
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return <RouterProvider router={router} />;
}

const meta = {
  title: "Features/Layout/AppTitle",
  component: AppTitle,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Sidebar header with the app logo, app name, and company name. Hides text when the sidebar is collapsed.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AppTitle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithProviders(),
};
