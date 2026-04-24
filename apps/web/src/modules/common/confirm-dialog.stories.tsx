import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog } from "./confirm-dialog";

const meta = {
  title: "Common/ConfirmDialog",
  component: ConfirmDialog,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Controlled AlertDialog wrapper with a destructive variant, loading state, and optional body slot. Use for confirming potentially destructive actions.",
      },
    },
  },
  tags: ["autodocs"],
  args: {
    open: true,
    onOpenChange: () => undefined,
    handleConfirm: () => undefined,
    title: "Delete project?",
    desc: "This will permanently remove the project and all associated data. This action cannot be undone.",
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: {
    destructive: true,
    confirmText: "Delete",
    title: "Delete account?",
    desc: "All of your data will be erased and cannot be recovered.",
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    confirmText: "Deleting...",
    destructive: true,
  },
};

export const WithChildren: Story = {
  args: {
    title: "Confirm archive",
    desc: "Archived items are moved out of the active workspace. You can restore them at any time.",
    children: (
      <p className="text-muted-foreground text-sm">
        Note: archived items don't count toward your plan limits.
      </p>
    ),
  },
};
