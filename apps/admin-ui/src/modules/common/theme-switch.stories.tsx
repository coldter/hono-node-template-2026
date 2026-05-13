import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "@/context/theme-provider";
import { ThemeSwitch } from "./theme-switch";

const meta = {
  title: "Common/ThemeSwitch",
  component: ThemeSwitch,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Icon button that opens a dropdown to choose between light, dark, and system themes. Reads and writes the theme via the ThemeProvider.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeSwitch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
