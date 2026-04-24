import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inbox, Plus, Users } from "lucide-react";
import { Button } from "@/modules/ui/button";
import { FullPageEmptyState } from "./full-page-empty-state";

const meta = {
  title: "Common/FullPageEmptyState",
  component: FullPageEmptyState,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Vertically centered empty state used when a route or section has no data yet. Accepts an icon, title, description, and optional CTA children.",
      },
    },
  },
  tags: ["autodocs"],
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
    title: "Your inbox is empty",
    description: "New messages will appear here as they arrive.",
    icon: Inbox,
  },
};

export const WithAction: Story = {
  args: {
    title: "No team members",
    description: "Invite teammates to start collaborating.",
    icon: Users,
    children: (
      <Button>
        <Plus />
        Invite members
      </Button>
    ),
  },
};
