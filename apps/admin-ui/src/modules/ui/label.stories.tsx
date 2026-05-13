import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Label",
  component: Label,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Accessible label built on Radix Label. Automatically dims when an associated peer or group is disabled, and can be paired with any form control via htmlFor.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    htmlFor: { control: "text" },
    children: { control: "text" },
  },
  args: {
    children: "Label text",
  },
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label {...args} htmlFor="label-input-story" />
      <Input id="label-input-story" placeholder="Your name" />
    </div>
  ),
  args: { children: "Name" },
};

export const WithCheckbox: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="label-checkbox-story" />
      <Label {...args} htmlFor="label-checkbox-story" />
    </div>
  ),
  args: { children: "Accept terms" },
};

export const DisabledPeer: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Input className="peer" disabled id="label-disabled-story" />
      <Label {...args} htmlFor="label-disabled-story" />
    </div>
  ),
  args: { children: "Disabled peer dims this label" },
};
