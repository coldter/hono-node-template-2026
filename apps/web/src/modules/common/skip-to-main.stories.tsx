import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { SkipToMain } from "./skip-to-main";

const meta = {
  component: SkipToMain,
  parameters: {
    docs: {
      description: {
        component:
          "Accessibility affordance that appears at the top of the page only when focused. Jumps keyboard users past navigation to the main content.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Common/SkipToMain",
} satisfies Meta<typeof SkipToMain>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="relative min-h-40 p-8">
      <p className="text-muted-foreground text-sm">
        Press Tab to reveal the skip link.
      </p>
      <SkipToMain />
    </div>
  ),
};

export const Focused: Story = {
  render: () => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const link = ref.current?.querySelector("a");
      link?.focus();
    }, []);
    return (
      <div className="relative min-h-40 p-8" ref={ref}>
        <p className="text-muted-foreground text-sm">
          The skip link is focused on mount to demonstrate its visible state.
        </p>
        <SkipToMain />
      </div>
    );
  },
};
