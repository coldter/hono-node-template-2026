import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "./calendar";

const meta = {
  component: Calendar,
  parameters: {
    docs: {
      description: {
        component:
          "Wraps react-day-picker with shadcn styles. Supports single-date, multi-date, and range selection, plus disabled dates via the `disabled` prop.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Calendar",
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    function Inner() {
      const [date, setDate] = useState<Date | undefined>(new Date());
      return (
        <Calendar
          className="rounded-md border"
          mode="single"
          onSelect={setDate}
          selected={date}
        />
      );
    }
    return <Inner />;
  },
};

export const Range: Story = {
  render: () => {
    function Inner() {
      const today = new Date();
      const inAWeek = new Date();
      inAWeek.setDate(today.getDate() + 6);
      const [range, setRange] = useState<DateRange | undefined>({
        from: today,
        to: inAWeek,
      });
      return (
        <Calendar
          className="rounded-md border"
          mode="range"
          numberOfMonths={2}
          onSelect={setRange}
          selected={range}
        />
      );
    }
    return <Inner />;
  },
};

export const WithDisabledDates: Story = {
  render: () => {
    function Inner() {
      const [date, setDate] = useState<Date | undefined>();
      return (
        <Calendar
          className="rounded-md border"
          disabled={{ dayOfWeek: [0, 6] }}
          mode="single"
          onSelect={setDate}
          selected={date}
        />
      );
    }
    return <Inner />;
  },
};
