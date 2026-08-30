import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserRoleBadges } from "./user-role-badges";

const meta = {
  argTypes: {
    max: { control: { max: 10, min: 0, type: "number" } },
  },
  component: UserRoleBadges,
  parameters: {
    docs: {
      description: {
        component:
          "Displays up to `max` role badges inline and collapses the rest into a `+N` badge. Used in the users table roles column.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Features/Users/UserRoleBadges",
} satisfies Meta<typeof UserRoleBadges>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoRoles: Story = { args: { roles: [] } };

export const SingleRole: Story = { args: { roles: ["admin"] } };

export const TwoRoles: Story = { args: { roles: ["admin", "editor"] } };

export const ManyRoles: Story = {
  args: { roles: ["admin", "editor", "viewer", "auditor", "support"] },
};

export const CustomMax: Story = {
  args: {
    max: 3,
    roles: ["admin", "editor", "viewer", "auditor", "support"],
  },
};
