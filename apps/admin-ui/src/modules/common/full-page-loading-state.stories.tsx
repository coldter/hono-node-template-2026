import type { Meta, StoryObj } from "@storybook/react-vite";
import { FullPageLoadingState } from "./full-page-loading-state";

const meta = {
  title: "Common/FullPageLoadingState",
  component: FullPageLoadingState,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full-page spinner with title and description. Use for top-level route suspense fallbacks.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FullPageLoadingState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomCopy: Story = {
  args: {
    title: "Preparing workspace",
    description: "Loading your preferences and recent projects...",
  },
};
