import type { Meta, StoryObj } from "@storybook/react-vite";
import { BadgeCheck, Star } from "lucide-react";
import { Badge } from "./badge";

const meta = {
  args: {
    children: "Badge",
  },
  argTypes: {
    children: { control: "text" },
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline"],
    },
  },
  component: Badge,
  parameters: {
    docs: {
      description: {
        component:
          "Compact label for status, counts, or tags. Supports variant and asChild for composition.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Badge",
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Destructive: Story = {
  args: { children: "Error", variant: "destructive" },
};

export const Outline: Story = {
  args: { variant: "outline" },
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <BadgeCheck />
        Verified
      </>
    ),
  },
};

export const AsLink: Story = {
  args: {
    asChild: true,
    children: <a href="#link">Link badge</a>,
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge>
        <Star />
        Featured
      </Badge>
      <Badge variant="secondary">
        <BadgeCheck />
        Pro
      </Badge>
    </div>
  ),
};
