import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog } from "./confirm-dialog";

const meta = {
  args: {
    desc: "This will permanently remove the project and all associated data. This action cannot be undone.",
    handleConfirm: () => undefined,
    onOpenChange: () => undefined,
    open: true,
    title: "Delete project?",
  },
  component: ConfirmDialog,
  parameters: {
    docs: {
      description: {
        component:
          "Controlled AlertDialog wrapper with a destructive variant, loading state, and optional body slot. Use for confirming potentially destructive actions.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Common/ConfirmDialog",
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: {
    confirmText: "Delete",
    desc: "All of your data will be erased and cannot be recovered.",
    destructive: true,
    title: "Delete account?",
  },
};

export const Loading: Story = {
  args: {
    confirmText: "Deleting...",
    destructive: true,
    isLoading: true,
  },
};

export const WithChildren: Story = {
  args: {
    children: (
      <p className="text-muted-foreground text-sm">
        Note: archived items don't count toward your plan limits.
      </p>
    ),
    desc: "Archived items are moved out of the active workspace. You can restore them at any time.",
    title: "Confirm archive",
  },
};
