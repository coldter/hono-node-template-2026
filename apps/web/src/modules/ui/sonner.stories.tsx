import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";
import { Button } from "./button";
import { Toaster } from "./sonner";

const meta = {
  title: "UI/Toaster",
  component: Toaster,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Themed wrapper around sonner's Toaster. Trigger toasts via the imperative toast() API.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Success: Story = {
  render: () => (
    <>
      <Button
        onClick={() => toast.success("Your changes have been saved.")}
        variant="default"
      >
        Show success
      </Button>
      <Toaster />
    </>
  ),
};

export const ErrorToast: Story = {
  render: () => (
    <>
      <Button
        onClick={() => toast.error("Something went wrong. Please try again.")}
        variant="destructive"
      >
        Show error
      </Button>
      <Toaster />
    </>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <>
      <Button
        onClick={() =>
          toast("Event created", {
            description: "Friday, February 10, 2026 at 9:30 AM",
          })
        }
        variant="outline"
      >
        Show with description
      </Button>
      <Toaster />
    </>
  ),
};

export const PromiseToast: Story = {
  render: () => (
    <>
      <Button
        onClick={() => {
          const work = new Promise<{ name: string }>((resolve) => {
            setTimeout(() => resolve({ name: "Report.pdf" }), 1500);
          });
          toast.promise(work, {
            loading: "Uploading file...",
            success: (data) => `${data.name} uploaded successfully`,
            error: "Upload failed",
          });
        }}
      >
        Show promise
      </Button>
      <Toaster />
    </>
  ),
};
