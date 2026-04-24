import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DatePicker } from "./date-picker";

const meta = {
  title: "Common/DatePicker",
  component: DatePicker,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Popover-backed single-date picker. Controlled — pass `selected` and an `onSelect` handler.",
      },
    },
  },
  tags: ["autodocs"],
  args: {
    selected: undefined,
    onSelect: () => undefined,
  },
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
