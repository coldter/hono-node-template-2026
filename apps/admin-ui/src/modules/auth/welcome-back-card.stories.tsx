import type { Meta, StoryObj } from "@storybook/react-vite";
import { WelcomeBackCard } from "./welcome-back-card";

const meta = {
  title: "Features/Auth/WelcomeBackCard",
  component: WelcomeBackCard,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Returning-user prompt shown when a recent session is detected. Offers to continue as the remembered user or switch accounts.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-96 rounded-md border bg-card p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    onContinue: () => undefined,
    onSwitchAccount: () => undefined,
  },
} satisfies Meta<typeof WelcomeBackCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithName: Story = {
  args: {
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    },
  },
};

export const WithImage: Story = {
  args: {
    user: {
      name: "Grace Hopper",
      email: "grace@example.com",
      image: "https://i.pravatar.cc/150?img=47",
    },
  },
};

export const EmailOnly: Story = {
  args: {
    user: {
      name: null,
      email: "user@example.com",
      image: null,
    },
  },
};
