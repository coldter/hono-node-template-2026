import type { Meta, StoryObj } from "@storybook/react-vite";
import { Overview } from "./overview";

const meta = {
  component: Overview,
  decorators: [
    (Story) => (
      <div className="w-[700px] rounded-md border bg-card p-4">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Bar chart shell used on the dashboard. Data is injected from the route loader in production; stories render the empty shape.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Features/Dashboard/Overview",
} satisfies Meta<typeof Overview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
