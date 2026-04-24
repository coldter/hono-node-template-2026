import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { Textarea } from "./textarea";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Multi-line text input. Auto-grows using field-sizing: content, respects aria-invalid for error state, and forwards all native textarea attributes.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    rows: { control: "number" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    "aria-invalid": { control: "boolean" },
  },
  args: {
    placeholder: "Type your message...",
  },
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    defaultValue:
      "The quick brown fox jumps over the lazy dog. Textareas auto-size as content grows.",
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Cannot edit this textarea." },
};

export const ReadOnly: Story = {
  args: { readOnly: true, defaultValue: "This content is read-only." },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "Something is wrong here" },
};

export const WithLabelAndHelp: Story = {
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="textarea-story">Bio</Label>
      <Textarea {...args} id="textarea-story" />
      <p className="text-muted-foreground text-sm">
        A short description about yourself.
      </p>
    </div>
  ),
  args: { placeholder: "Tell us about yourself..." },
};
