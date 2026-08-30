import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  args: {
    children: "Label text",
  },
  argTypes: {
    children: { control: "text" },
    htmlFor: { control: "text" },
  },
  component: Label,
  parameters: {
    docs: {
      description: {
        component:
          "Accessible label built on Radix Label. Automatically dims when an associated peer or group is disabled, and can be paired with any form control via htmlFor.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Label",
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInput: Story = {
  args: { children: "Name" },
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label {...args} htmlFor="label-input-story" />
      <Input id="label-input-story" placeholder="Your name" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  args: { children: "Accept terms" },
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="label-checkbox-story" />
      <Label {...args} htmlFor="label-checkbox-story" />
    </div>
  ),
};

export const DisabledPeer: Story = {
  args: { children: "Disabled peer dims this label" },
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Input className="peer" disabled id="label-disabled-story" />
      <Label {...args} htmlFor="label-disabled-story" />
    </div>
  ),
};
