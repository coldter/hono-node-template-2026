import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircle, CheckCircle2, Info, Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./alert";

const meta = {
  title: "UI/Alert",
  component: Alert,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Contextual feedback banner. Compose with AlertTitle and AlertDescription; accepts an optional leading icon.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "radio",
      options: ["default", "destructive"],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args}>
      <Terminal />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the CLI.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args}>
      <AlertCircle />
      <AlertTitle>Unable to process your payment</AlertTitle>
      <AlertDescription>
        Please verify your billing information and try again.
      </AlertDescription>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  render: (args) => (
    <Alert {...args}>
      <Info />
      <AlertTitle>A new version is available</AlertTitle>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>No icon here</AlertTitle>
      <AlertDescription>
        Alerts work without a leading icon too.
      </AlertDescription>
    </Alert>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>
          Used for neutral or positive messaging.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>
          Used for errors or destructive outcomes.
        </AlertDescription>
      </Alert>
    </div>
  ),
};
