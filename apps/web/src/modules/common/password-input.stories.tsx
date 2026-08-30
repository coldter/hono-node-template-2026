import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PasswordInput } from "./password-input";

const meta = {
  args: {
    placeholder: "Password",
  },
  component: PasswordInput,
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Password field with a trailing toggle that switches between masked and visible text.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Common/PasswordInput",
} satisfies Meta<typeof PasswordInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  render: () => {
    const [value, setValue] = useState("hunter2-super-secret");
    return (
      <PasswordInput
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
    );
  },
};

export const ToggleShown: Story = {
  args: {
    defaultValue: "hunter2-super-secret",
  },
  parameters: {
    docs: {
      description: {
        story:
          "Click the eye icon inside the input to reveal the value. Rendering as uncontrolled with a defaultValue.",
      },
    },
  },
};

export const Disabled: Story = {
  args: { defaultValue: "hunter2", disabled: true },
};
