import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  args: {
    placeholder: "Type something...",
  },
  argTypes: {
    "aria-invalid": { control: "boolean" },
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
    readOnly: { control: "boolean" },
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search", "tel", "url"],
    },
  },
  component: Input,
  parameters: {
    docs: {
      description: {
        component:
          "Single-line text input styled to match the design system. Thin wrapper over the native input element that forwards all standard attributes and reacts to aria-invalid.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Input",
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Email: Story = {
  args: { placeholder: "you@example.com", type: "email" },
};

export const Password: Story = {
  args: { placeholder: "Password", type: "password" },
};

export const NumberType: Story = {
  args: { placeholder: "0", type: "number" },
};

export const Search: Story = {
  args: { placeholder: "Search", type: "search" },
};

export const File: Story = {
  args: { type: "file" },
};

export const Disabled: Story = {
  args: { defaultValue: "Cannot edit", disabled: true },
};

export const ReadOnly: Story = {
  args: { defaultValue: "Read only value", readOnly: true },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "not-an-email" },
};

export const WithLabelAndHelp: Story = {
  args: { placeholder: "you@example.com" },
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="email-story">Email</Label>
      <Input {...args} id="email-story" type="email" />
      <p className="text-muted-foreground text-sm">
        We will never share your email.
      </p>
    </div>
  ),
};
