import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnalyticsChart } from "./analytics-chart";

const meta = {
  title: "Features/Dashboard/AnalyticsChart",
  component: AnalyticsChart,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Weekly clicks vs. unique visitors area chart built on recharts. The component generates random mock data at import time.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[720px] rounded-md border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnalyticsChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
