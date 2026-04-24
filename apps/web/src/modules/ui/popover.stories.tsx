import type { Meta, StoryObj } from "@storybook/react-vite";
import { Settings2 } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta = {
  title: "UI/Popover",
  component: Popover,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Radix popover that anchors floating content to a trigger. Use for short-form controls, inline forms, and contextual actions.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-2">
          <p className="font-medium text-sm">Quick note</p>
          <p className="text-muted-foreground text-sm">
            Popovers show contextual content without leaving the page.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Settings2 />
          Dimensions
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="grid gap-3">
          <p className="font-medium text-sm">Dimensions</p>
          <div className="grid gap-2">
            <Label htmlFor="width">Width</Label>
            <Input defaultValue="100%" id="width" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="height">Height</Label>
            <Input defaultValue="24px" id="height" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
