import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "./button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Primary interactive element. Built on Radix Slot + class-variance-authority. Supports variant, size, asChild for composition, and an isLoading state with optional loadingText.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
      description: "Visual style variant",
    },
    size: {
      control: "radio",
      options: ["default", "sm", "lg", "icon"],
      description: "Button size",
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
    asChild: {
      control: "boolean",
      description: "Render as the child element (Radix Slot)",
    },
    children: {
      control: "text",
    },
  },
  args: {
    children: "Button",
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete" },
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
  args: { variant: "link", children: "Read more" },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const Large: Story = {
  args: { size: "lg" },
};

export const Icon: Story = {
  args: {
    size: "icon",
    "aria-label": "Add",
    children: <Plus />,
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
    variant: "destructive",
    children: (
      <>
        <Trash2 />
        Delete account
      </>
    ),
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Loading: Story = {
  args: { isLoading: true, children: "Saving" },
};

export const LoadingWithText: Story = {
  args: { isLoading: true, children: "Save", loadingText: "Saving..." },
};

export const AllVariants: Story = {
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
  args: { children: undefined },
};

export const AllSizes: Story = {
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
  args: { children: undefined },
};
