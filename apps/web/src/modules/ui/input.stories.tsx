import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Single-line text input styled to match the design system. Thin wrapper over the native input element that forwards all standard attributes and reacts to aria-invalid.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search", "tel", "url"],
    },
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
  },
  args: {
    placeholder: "Type something...",
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Email: Story = {
  args: { type: "email", placeholder: "you@example.com" },
};

export const Password: Story = {
  args: { type: "password", placeholder: "Password" },
};

export const NumberType: Story = {
  args: { type: "number", placeholder: "0" },
};

export const Search: Story = {
  args: { type: "search", placeholder: "Search" },
};

export const File: Story = {
  args: { type: "file" },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Cannot edit" },
};

export const ReadOnly: Story = {
  args: { readOnly: true, defaultValue: "Read only value" },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "not-an-email" },
};

export const WithLabelAndHelp: Story = {
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="email-story">Email</Label>
      <Input {...args} id="email-story" type="email" />
      <p className="text-muted-foreground text-sm">
        We will never share your email.
      </p>
    </div>
  ),
  args: { placeholder: "you@example.com" },
};
