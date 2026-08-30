import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { Textarea } from "./textarea";

const meta = {
  args: {
    placeholder: "Type your message...",
  },
  argTypes: {
    "aria-invalid": { control: "boolean" },
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
    readOnly: { control: "boolean" },
    rows: { control: "number" },
  },
  component: Textarea,
  parameters: {
    docs: {
      description: {
        component:
          "Multi-line text input. Auto-grows using field-sizing: content, respects aria-invalid for error state, and forwards all native textarea attributes.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Textarea",
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
  args: { defaultValue: "Cannot edit this textarea.", disabled: true },
};

export const ReadOnly: Story = {
  args: { defaultValue: "This content is read-only.", readOnly: true },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "Something is wrong here" },
};

export const WithLabelAndHelp: Story = {
  args: { placeholder: "Tell us about yourself..." },
  render: (args) => (
    <div className="grid w-80 gap-2">
      <Label htmlFor="textarea-story">Bio</Label>
      <Textarea {...args} id="textarea-story" />
      <p className="text-muted-foreground text-sm">
        A short description about yourself.
      </p>
    </div>
  ),
};
