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
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return <RouterProvider router={router} />;
}

const meta = {
  component: AppTitle,
  parameters: {
    docs: {
      description: {
        component:
          "Sidebar header with the app logo, app name, and company name. Hides text when the sidebar is collapsed.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Features/Layout/AppTitle",
} satisfies Meta<typeof AppTitle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => renderWithProviders(),
};
