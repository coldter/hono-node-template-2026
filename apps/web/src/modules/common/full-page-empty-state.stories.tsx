import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox, Plus, Users } from "lucide-react";
import { Button } from "@/modules/ui/button";
import { FullPageEmptyState } from "./full-page-empty-state";

const meta = {
  component: FullPageEmptyState,
  parameters: {
    docs: {
      description: {
        component:
          "Vertically centered empty state used when a route or section has no data yet. Accepts an icon, title, description, and optional CTA children.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Common/FullPageEmptyState",
} satisfies Meta<typeof FullPageEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "No items yet",
  },
};

export const WithDescription: Story = {
  args: {
    description: "New messages will appear here as they arrive.",
    icon: Inbox,
    title: "Your inbox is empty",
  },
};

export const WithAction: Story = {
  args: {
    children: (
      <Button>
        <Plus />
        Invite members
      </Button>
    ),
    description: "Invite teammates to start collaborating.",
    icon: Users,
    title: "No team members",
  },
};
