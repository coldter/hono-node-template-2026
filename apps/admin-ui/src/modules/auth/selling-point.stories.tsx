import type { Meta, StoryObj } from "@storybook/react-vite";
import { SellingPoint } from "./selling-point";

const meta = {
  title: "Features/Auth/SellingPoint",
  component: SellingPoint,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Marketing panel used on the split-screen auth layout. Renders a headline over an animated gradient or a background image.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="h-[600px] w-[640px] overflow-hidden rounded-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SellingPoint>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DefaultGradient: Story = {
  args: {
    title: "Ship faster",
    description:
      "A modern starter with auth, analytics, and design primitives built in.",
  },
};

export const CustomGradient: Story = {
  args: {
    title: "Own your stack",
    description: "Replace sections without rewriting the whole surface.",
    bgGradient: "from-emerald-500 via-teal-500 to-cyan-500",
  },
};
