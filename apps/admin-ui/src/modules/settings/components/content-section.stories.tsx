import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";
import { ContentSection } from "./content-section";

const meta = {
  title: "Features/Settings/ContentSection",
  component: ContentSection,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Titled section shell used for settings pages. Provides a heading, description, separator, and a scrollable content area.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="h-[520px] w-[720px] rounded-md border bg-background p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContentSection>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  args: {
    title: "Profile",
    desc: "This is how others will see you on the site.",
    children: (
      <form className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input defaultValue="Ada Lovelace" id="display-name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Input defaultValue="Mathematician & first programmer" id="bio" />
        </div>
        <Button type="button">Save changes</Button>
      </form>
    ),
  },
};
