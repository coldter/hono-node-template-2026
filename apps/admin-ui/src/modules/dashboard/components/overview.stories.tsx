import type { Meta, StoryObj } from "@storybook/react-vite";
import { Overview } from "./overview";

const meta = {
  title: "Features/Dashboard/Overview",
  component: Overview,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Bar chart shell used on the dashboard. Data is injected from the route loader in production; stories render the empty shape.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[700px] rounded-md border bg-card p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Overview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
