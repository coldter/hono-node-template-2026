import type { Meta, StoryObj } from "@storybook/react-vite";
import { SellingPoint } from "./selling-point";

const meta = {
  component: SellingPoint,
  decorators: [
    (Story) => (
      <div className="h-[600px] w-[640px] overflow-hidden rounded-md">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Marketing panel used on the split-screen auth layout. Renders a headline over an animated gradient or a background image.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Features/Auth/SellingPoint",
} satisfies Meta<typeof SellingPoint>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DefaultGradient: Story = {
  args: {
    description:
      "A modern starter with auth, analytics, and design primitives built in.",
    title: "Ship faster",
  },
};

export const CustomGradient: Story = {
  args: {
    bgGradient: "from-emerald-500 via-teal-500 to-cyan-500",
    description: "Replace sections without rewriting the whole surface.",
    title: "Own your stack",
  },
};
