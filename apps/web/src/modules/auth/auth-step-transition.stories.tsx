import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@/modules/ui/button";
import { AuthStepTransition } from "./auth-step-transition";

const meta = {
  args: {
    children: null,
    step: "email",
  },
  component: AuthStepTransition,
  parameters: {
    docs: {
      description: {
        component:
          "Framer-motion wrapper that animates between keyed steps in a multi-step auth flow. Change `step` to trigger the transition.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Features/Auth/AuthStepTransition",
} satisfies Meta<typeof AuthStepTransition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: () => {
    const [step, setStep] = useState<"email" | "password">("email");
    return (
      <div className="flex w-80 flex-col gap-4">
        <AuthStepTransition step={step}>
          {step === "email" ? (
            <div className="rounded-md border p-4">
              <h3 className="font-semibold text-lg">Sign in</h3>
              <p className="text-muted-foreground text-sm">
                Enter your email to continue.
              </p>
            </div>
          ) : (
            <div className="rounded-md border p-4">
              <h3 className="font-semibold text-lg">Enter password</h3>
              <p className="text-muted-foreground text-sm">
                Complete sign in with your password.
              </p>
            </div>
          )}
        </AuthStepTransition>
        <div className="flex gap-2">
          <Button
            disabled={step === "email"}
            onClick={() => setStep("email")}
            size="sm"
            variant="outline"
          >
            Back
          </Button>
          <Button
            disabled={step === "password"}
            onClick={() => setStep("password")}
            size="sm"
          >
            Next
          </Button>
        </div>
      </div>
    );
  },
};
