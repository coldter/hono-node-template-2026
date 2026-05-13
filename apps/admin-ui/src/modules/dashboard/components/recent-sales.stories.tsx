import type { Meta, StoryObj } from "@storybook/react-vite";
import { RecentSales } from "./recent-sales";

const meta = {
  title: "Features/Dashboard/RecentSales",
  component: RecentSales,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "List of recent account activity. The component currently renders an empty-state when there is no data; full data is wired from the dashboard route.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[420px] rounded-md border bg-card p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecentSales>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
