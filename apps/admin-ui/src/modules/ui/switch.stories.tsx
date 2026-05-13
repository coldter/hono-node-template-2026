import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { Switch } from "./switch";

const meta = {
  title: "UI/Switch",
  component: Switch,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Toggle control for binary on/off settings. Built on Radix Switch; supports controlled checked, defaultChecked, and disabled.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    checked: { control: "boolean" },
    defaultChecked: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {},
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const DisabledChecked: Story = {
  args: { disabled: true, defaultChecked: true },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Switch {...args} id="switch-story" />
      <Label htmlFor="switch-story">Airplane mode</Label>
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex items-center gap-3">
        <Switch id="sw-off" />
        <Label htmlFor="sw-off">Off</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch defaultChecked id="sw-on" />
        <Label htmlFor="sw-on">On</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch disabled id="sw-disabled" />
        <Label htmlFor="sw-disabled">Disabled</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch defaultChecked disabled id="sw-disabled-on" />
        <Label htmlFor="sw-disabled-on">Disabled on</Label>
      </div>
    </div>
  ),
};
