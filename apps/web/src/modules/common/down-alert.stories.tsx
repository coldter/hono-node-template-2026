import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { type DownAlertType, useAlertStore } from "@/store/alert";
import { DownAlert } from "./down-alert";

const meta = {
  title: "Common/DownAlert",
  component: DownAlert,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Sticky top-of-window notice driven by the alert zustand store. Triggered for connectivity, auth, maintenance, and authorization states.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DownAlert>;

export default meta;

type Story = StoryObj<typeof meta>;

function WithAlert({ alert }: { alert: DownAlertType }) {
  const setDownAlert = useAlertStore((state) => state.setDownAlert);
  useEffect(() => {
    setDownAlert(alert);
    return () => setDownAlert(null);
  }, [alert, setDownAlert]);
  return (
    <div className="min-h-40 p-8 text-muted-foreground text-sm">
      <DownAlert />
      Background page content.
    </div>
  );
}

export const AuthExpired: Story = {
  render: () => <WithAlert alert="auth_expired" />,
};

export const SessionInvalidated: Story = {
  render: () => <WithAlert alert="session_invalidated" />,
};

export const AuthUnavailable: Story = {
  render: () => <WithAlert alert="auth_unavailable" />,
};

export const Maintenance: Story = {
  render: () => <WithAlert alert="maintenance" />,
};

export const Forbidden: Story = {
  render: () => <WithAlert alert="forbidden" />,
};
