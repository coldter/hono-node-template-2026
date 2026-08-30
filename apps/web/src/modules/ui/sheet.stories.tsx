import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const meta = {
  component: Sheet,
  parameters: {
    docs: {
      description: {
        component:
          "Slide-in panel anchored to an edge of the viewport. Built on Radix Dialog; supports top, right, bottom, and left sides.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "UI/Sheet",
} satisfies Meta<typeof Sheet>;

export default meta;

type Story = StoryObj<typeof meta>;

function EditProfileSheet({
  side = "right",
  defaultOpen = false,
}: {
  side?: "top" | "right" | "bottom" | "left";
  defaultOpen?: boolean;
}) {
  return (
    <Sheet defaultOpen={defaultOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">Open {side} sheet</Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Update your details here. Click save when you are done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4">
          <div className="grid gap-2">
            <Label htmlFor={`${side}-name`}>Name</Label>
            <Input defaultValue="Ada Lovelace" id={`${side}-name`} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${side}-username`}>Username</Label>
            <Input defaultValue="@ada" id={`${side}-username`} />
          </div>
        </div>
        <SheetFooter>
          <Button type="submit">Save changes</Button>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export const Right: Story = {
  render: () => <EditProfileSheet defaultOpen side="right" />,
};

export const Left: Story = {
  render: () => <EditProfileSheet side="left" />,
};

export const Top: Story = {
  render: () => <EditProfileSheet side="top" />,
};

export const Bottom: Story = {
  render: () => <EditProfileSheet side="bottom" />,
};
