import type { Meta, StoryObj } from "@storybook/react-vite";
import { FullPageLoadingState } from "./full-page-loading-state";

const meta = {
  component: FullPageLoadingState,
  parameters: {
    docs: {
      description: {
        component:
          "Full-page spinner with title and description. Use for top-level route suspense fallbacks.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Common/FullPageLoadingState",
} satisfies Meta<typeof FullPageLoadingState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomCopy: Story = {
  args: {
    description: "Loading your preferences and recent projects...",
    title: "Preparing workspace",
  },
};
