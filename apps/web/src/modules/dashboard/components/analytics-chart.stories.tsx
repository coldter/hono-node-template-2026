import type { Meta, StoryObj } from "@storybook/react-vite";
import { AnalyticsChart } from "./analytics-chart";

const meta = {
  component: AnalyticsChart,
  decorators: [
    (Story) => (
      <div className="w-[720px] rounded-md border bg-card p-4">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Weekly clicks vs. unique visitors area chart built on recharts. The component generates random mock data at import time.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Features/Dashboard/AnalyticsChart",
} satisfies Meta<typeof AnalyticsChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
