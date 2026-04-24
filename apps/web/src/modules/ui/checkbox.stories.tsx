import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox } from "./checkbox";
import { Label } from "./label";

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Binary selection control built on Radix Checkbox. Supports checked, unchecked, and indeterminate states plus aria-invalid for validation.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    checked: {
      control: "select",
      options: [true, false, "indeterminate"],
    },
    disabled: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
  },
  args: {},
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Indeterminate: Story = {
  args: { checked: "indeterminate" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const DisabledChecked: Story = {
  args: { disabled: true, defaultChecked: true },
};

export const Invalid: Story = {
  args: { "aria-invalid": true },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox {...args} id="checkbox-story-label" />
      <Label htmlFor="checkbox-story-label">Accept terms and conditions</Label>
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex items-center gap-2">
        <Checkbox id="cs-unchecked" />
        <Label htmlFor="cs-unchecked">Unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox defaultChecked id="cs-checked" />
        <Label htmlFor="cs-checked">Checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked="indeterminate" id="cs-indeterminate" />
        <Label htmlFor="cs-indeterminate">Indeterminate</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox disabled id="cs-disabled" />
        <Label htmlFor="cs-disabled">Disabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox defaultChecked disabled id="cs-disabled-checked" />
        <Label htmlFor="cs-disabled-checked">Disabled checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox aria-invalid id="cs-invalid" />
        <Label htmlFor="cs-invalid">Invalid</Label>
      </div>
    </div>
  ),
};
