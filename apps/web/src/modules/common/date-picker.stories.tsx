import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DatePicker } from "./date-picker";

const meta = {
  args: {
    onSelect: () => undefined,
    selected: undefined,
  },
  component: DatePicker,
  parameters: {
    docs: {
      description: {
        component:
          "Popover-backed single-date picker. Controlled — pass `selected` and an `onSelect` handler.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Common/DatePicker",
} satisfies Meta<typeof DatePicker>;

export default meta;

type Story = StoryObj<typeof meta>;

function Controlled({ initial }: { initial?: Date }) {
  const [date, setDate] = useState<Date | undefined>(initial);
  return <DatePicker onSelect={setDate} selected={date} />;
}

export const Empty: Story = {
  render: () => <Controlled />,
};

export const WithInitialDate: Story = {
  render: () => <Controlled initial={new Date(2025, 5, 12)} />,
};

export const CustomPlaceholder: Story = {
  render: () => {
    const [date, setDate] = useState<Date | undefined>();
    return (
      <DatePicker
        onSelect={setDate}
        placeholder="Select due date"
        selected={date}
      />
    );
  },
};
