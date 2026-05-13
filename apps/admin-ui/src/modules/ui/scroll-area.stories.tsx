import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";

const tags = Array.from({ length: 50 }, (_, i) => `Tag ${i + 1}`);
const wideItems = Array.from({ length: 30 }, (_, i) => `Column ${i + 1}`);

const meta = {
  title: "UI/ScrollArea",
  component: ScrollArea,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Styled scroll container with custom scrollbar. Supports vertical and horizontal orientations.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    orientation: {
      control: "radio",
      options: ["vertical", "horizontal"],
    },
  },
} satisfies Meta<typeof ScrollArea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  render: (args) => (
    <ScrollArea {...args} className="h-64 w-60 rounded-md border">
      <div className="p-4">
        <h4 className="mb-3 text-sm leading-none font-medium">Tags</h4>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  args: { orientation: "horizontal" },
  render: (args) => (
    <ScrollArea {...args} className="w-96 rounded-md border whitespace-nowrap">
      <div className="flex gap-3 p-4">
        {wideItems.map((item) => (
          <div
            className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-md text-sm"
            key={item}
          >
            {item}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const LongProse: Story = {
  render: () => (
    <ScrollArea className="h-72 w-96 rounded-md border p-4">
      <div className="flex flex-col gap-3 text-sm">
        {Array.from({ length: 20 }, (_, i) => (
          <p key={`p-${i.toString()}`}>
            Paragraph {i + 1}. Lorem ipsum dolor sit amet, consectetur
            adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante
            dapibus diam. Sed nisi. Nulla quis sem at nibh elementum imperdiet.
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
};
