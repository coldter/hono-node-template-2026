import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecentSales } from "./recent-sales";

const meta = {
  component: RecentSales,
  decorators: [
    (Story) => (
      <div className="w-[420px] rounded-md border bg-card p-6">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "List of recent account activity. The component currently renders an empty-state when there is no data; full data is wired from the dashboard route.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Features/Dashboard/RecentSales",
} satisfies Meta<typeof RecentSales>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
