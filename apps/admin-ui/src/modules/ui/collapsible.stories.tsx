import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";

const meta = {
  title: "UI/Collapsible",
  component: Collapsible,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Radix Collapsible primitive for show/hide content regions. Compose your own trigger and content; this module is styling-free.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Collapsible>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible className="w-[380px] space-y-2">
      <div className="flex items-center justify-between rounded-md border px-4 py-2">
        <p className="font-medium text-sm">Starred repositories</p>
        <CollapsibleTrigger asChild>
          <Button aria-label="Toggle" size="icon" variant="ghost">
            <ChevronsUpDown />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        <div className="rounded-md border px-4 py-2 font-mono text-sm">
          @acme/ui
        </div>
        <div className="rounded-md border px-4 py-2 font-mono text-sm">
          @acme/hooks
        </div>
        <div className="rounded-md border px-4 py-2 font-mono text-sm">
          @acme/server
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Collapsible className="w-[380px] space-y-2" defaultOpen>
      <div className="flex items-center justify-between rounded-md border px-4 py-2">
        <p className="font-medium text-sm">Advanced options</p>
        <CollapsibleTrigger asChild>
          <Button aria-label="Toggle" size="icon" variant="ghost">
            <ChevronsUpDown />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="space-y-2">
        <div className="rounded-md border px-4 py-2 text-sm">
          Toggle verbose logging.
        </div>
        <div className="rounded-md border px-4 py-2 text-sm">
          Enable experimental features.
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
