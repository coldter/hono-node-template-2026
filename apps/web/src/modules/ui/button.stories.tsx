import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "./button";

const meta = {
  args: {
    children: "Button",
  },
  argTypes: {
    asChild: {
      control: "boolean",
      description: "Render as the child element (Radix Slot)",
    },
    children: {
      control: "text",
    },
    disabled: {
      control: "boolean",
    },
    isLoading: {
      control: "boolean",
      description: "Show spinner and disable the button",
    },
    loadingText: {
      control: "text",
      description: "Text shown next to spinner while loading",
    },
    size: {
      control: "radio",
      description: "Button size",
      options: ["default", "sm", "lg", "icon"],
    },
    variant: {
      control: "select",
      description: "Visual style variant",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
    },
  },
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          "Primary interactive element. Built on Radix Slot + class-variance-authority. Supports variant, size, asChild for composition, and an isLoading state with optional loadingText.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Button",
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
};

export const Outline: Story = {
  args: { variant: "outline" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Ghost: Story = {
  args: { variant: "ghost" },
};

export const Link: Story = {
  args: { children: "Read more", variant: "link" },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const Large: Story = {
  args: { size: "lg" },
};

export const Icon: Story = {
  args: {
    "aria-label": "Add",
    children: <Plus />,
    size: "icon",
  },
};

export const WithLeadingIcon: Story = {
  args: {
    children: (
      <>
        <Plus />
        Add item
      </>
    ),
  },
};

export const WithTrailingIcon: Story = {
  args: {
    children: (
      <>
        Continue
        <ArrowRight />
      </>
    ),
  },
};

export const DestructiveWithIcon: Story = {
  args: {
    children: (
      <>
        <Trash2 />
        Delete account
      </>
    ),
    variant: "destructive",
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Loading: Story = {
  args: { children: "Saving", isLoading: true },
};

export const LoadingWithText: Story = {
  args: { children: "Save", isLoading: true, loadingText: "Saving..." },
};

export const AllVariants: Story = {
  args: { children: undefined },
  render: (args) => (
    <div className="flex flex-wrap gap-3">
      <Button {...args} variant="default">
        Default
      </Button>
      <Button {...args} variant="destructive">
        Destructive
      </Button>
      <Button {...args} variant="outline">
        Outline
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
      <Button {...args} variant="link">
        Link
      </Button>
    </div>
  ),
};

export const AllSizes: Story = {
  args: { children: undefined },
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
      <Button {...args} aria-label="Add" size="icon">
        <Plus />
      </Button>
    </div>
  ),
};
