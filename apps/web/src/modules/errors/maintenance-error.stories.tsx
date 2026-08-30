import type { Meta, StoryObj } from "@storybook/react-vite";
import { MaintenanceError } from "./maintenance-error";

const meta = {
  component: MaintenanceError,
  parameters: {
    docs: {
      description: {
        component:
          "503 full-page notice shown while the site is offline for scheduled maintenance.",
      },
    },
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  title: "Errors/MaintenanceError",
} satisfies Meta<typeof MaintenanceError>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
