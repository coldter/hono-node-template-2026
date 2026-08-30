import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComingSoon } from "./coming-soon";

const meta = {
  component: ComingSoon,
  parameters: {
    docs: {
      description: {
        component:
          "Full-height placeholder used for routes that exist in navigation but are not yet implemented.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Common/ComingSoon",
} satisfies Meta<typeof ComingSoon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
