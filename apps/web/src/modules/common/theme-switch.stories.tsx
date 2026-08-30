import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "@/context/theme-provider";
import { ThemeSwitch } from "./theme-switch";

const meta = {
  component: ThemeSwitch,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Icon button that opens a dropdown to choose between light, dark, and system themes. Reads and writes the theme via the ThemeProvider.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Common/ThemeSwitch",
} satisfies Meta<typeof ThemeSwitch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
