import type { Meta, StoryObj } from "@storybook/react-vite";
import { Main } from "./main";

const meta = {
  title: "Features/Layout/Main",
  component: Main,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Page content wrapper. Applies consistent padding and caps width unless `fluid` is set; switches to a flex column when `fixed`.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Main>;

export default meta;

type Story = StoryObj<typeof meta>;

const placeholder = (
  <div className="rounded-md border bg-card p-6">
    <h2 className="font-semibold text-xl">Page heading</h2>
    <p className="text-muted-foreground text-sm">
      This is rendered inside the Main wrapper.
    </p>
  </div>
);

export const Default: Story = {
  args: { children: placeholder },
};

export const Fluid: Story = {
  args: { fluid: true, children: placeholder },
};

export const Fixed: Story = {
  render: () => (
    <div className="flex h-[400px] flex-col">
      <Main fixed>{placeholder}</Main>
    </div>
  ),
};
