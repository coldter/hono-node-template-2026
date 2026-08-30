import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  component: Tabs,
  parameters: {
    docs: {
      description: {
        component:
          "Radix Tabs composition. Use for grouping related content at the same level of navigation; set defaultValue for the initially active tab.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "UI/Tabs",
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TwoTabs: Story = {
  render: () => (
    <Tabs className="w-[420px]" defaultValue="account">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <div className="rounded-md border p-4 text-sm">
          Manage your account details and preferences here.
        </div>
      </TabsContent>
      <TabsContent value="password">
        <div className="rounded-md border p-4 text-sm">
          Change your password. Log out of other sessions afterward.
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const ThreeTabs: Story = {
  render: () => (
    <Tabs className="w-[480px]" defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="rounded-md border p-4 text-sm">
          A high-level summary of activity.
        </div>
      </TabsContent>
      <TabsContent value="analytics">
        <div className="rounded-md border p-4 text-sm">
          Deeper charts and visualisations go here.
        </div>
      </TabsContent>
      <TabsContent value="reports">
        <div className="rounded-md border p-4 text-sm">
          Export or schedule recurring reports.
        </div>
      </TabsContent>
    </Tabs>
  ),
};
