import type { Meta, StoryObj } from "@storybook/react-vite";
import { Spinner } from "./spinner";

const meta = {
  title: "UI/Spinner",
  component: Spinner,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Loading indicator with multiple types (circle, dots, pulse, bars, ring), sizes, variants, and speeds.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "radio",
      options: ["xs", "sm", "md", "lg", "xl"],
    },
    variant: {
      control: "radio",
      options: ["default", "primary", "white", "destructive"],
    },
    speed: {
      control: "radio",
      options: ["slow", "normal", "fast"],
    },
    type: {
      control: "radio",
      options: ["circle", "dots", "pulse", "bars", "ring"],
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: "primary", size: "md" },
};

export const Destructive: Story = {
  args: { variant: "destructive", size: "md" },
};

export const AllSizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      <Spinner {...args} size="xs" />
      <Spinner {...args} size="sm" />
      <Spinner {...args} size="md" />
      <Spinner {...args} size="lg" />
      <Spinner {...args} size="xl" />
    </div>
  ),
};

export const AllTypes: Story = {
  render: () => (
    <div className="grid grid-cols-5 items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" type="circle" variant="primary" />
        <span className="text-muted-foreground text-xs">circle</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" type="dots" variant="primary" />
        <span className="text-muted-foreground text-xs">dots</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" type="pulse" variant="primary" />
        <span className="text-muted-foreground text-xs">pulse</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" type="bars" variant="primary" />
        <span className="text-muted-foreground text-xs">bars</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Spinner size="lg" type="ring" variant="primary" />
        <span className="text-muted-foreground text-xs">ring</span>
      </div>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-6 rounded-md bg-neutral-800 p-6">
      <Spinner size="md" variant="default" />
      <Spinner size="md" variant="primary" />
      <Spinner size="md" variant="white" />
      <Spinner size="md" variant="destructive" />
    </div>
  ),
};

export const Speeds: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Spinner size="lg" speed="slow" variant="primary" />
      <Spinner size="lg" speed="normal" variant="primary" />
      <Spinner size="lg" speed="fast" variant="primary" />
    </div>
  ),
};
