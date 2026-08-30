import type { Meta, StoryObj } from "@storybook/react-vite";
import { WelcomeBackCard } from "./welcome-back-card";

const meta = {
  args: {
    onContinue: () => undefined,
    onSwitchAccount: () => undefined,
  },
  component: WelcomeBackCard,
  decorators: [
    (Story) => (
      <div className="w-96 rounded-md border bg-card p-6">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "Returning-user prompt shown when a recent session is detected. Offers to continue as the remembered user or switch accounts.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Features/Auth/WelcomeBackCard",
} satisfies Meta<typeof WelcomeBackCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithName: Story = {
  args: {
    user: {
      email: "ada@example.com",
      image: null,
      name: "Ada Lovelace",
    },
  },
};

export const WithImage: Story = {
  args: {
    user: {
      email: "grace@example.com",
      image: "https://i.pravatar.cc/150?img=47",
      name: "Grace Hopper",
    },
  },
};

export const EmailOnly: Story = {
  args: {
    user: {
      email: "user@example.com",
      image: null,
      name: null,
    },
  },
};
