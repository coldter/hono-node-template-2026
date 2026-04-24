import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserStatusBadge } from "./user-status-badge";

const meta = {
  title: "Features/Users/UserStatusBadge",
  component: UserStatusBadge,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Badge that renders a user's lifecycle status (active / inactive / locked) using the shared `USER_STATUS_CONFIG`.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    status: {
      control: "radio",
      options: ["active", "inactive", "locked"],
    },
  },
} satisfies Meta<typeof UserStatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Active: Story = { args: { status: "active" } };

export const Inactive: Story = { args: { status: "inactive" } };

export const Locked: Story = { args: { status: "locked" } };

export const AllStatuses: Story = {
  args: { status: "active" },
  render: () => (
    <div className="flex items-center gap-2">
      <UserStatusBadge status="active" />
      <UserStatusBadge status="inactive" />
      <UserStatusBadge status="locked" />
    </div>
  ),
};
