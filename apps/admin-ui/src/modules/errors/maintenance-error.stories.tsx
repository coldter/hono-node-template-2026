import type { Meta, StoryObj } from "@storybook/react-vite";
import { MaintenanceError } from "./maintenance-error";

const meta = {
  title: "Errors/MaintenanceError",
  component: MaintenanceError,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "503 full-page notice shown while the site is offline for scheduled maintenance.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MaintenanceError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
