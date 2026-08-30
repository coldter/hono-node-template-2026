import {
  CloudOff,
  Construction,
  KeyRound,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useOnlineManager } from "@/hooks/use-online-manager";
import { Alert, AlertDescription } from "@/modules/ui/alert";
import { Button } from "@/modules/ui/button";
import { useAlertStore } from "@/store/alert";

const downAlertConfig = {
  auth_expired: {
    content: "Your login has expired. Please sign in again.",
    icon: KeyRound,
    title: "Session Expired",
    variant: "destructive",
  },
  auth_unavailable: {
    content: "We are having trouble connecting to the authentication server.",
    icon: TriangleAlert,
    title: "Authentication Unavailable",
    variant: "destructive",
  },
  forbidden: {
    content: "You do not have permission to access this resource.",
    icon: ShieldAlert,
    title: "Access Denied",
    variant: "destructive",
  },
  maintenance: {
    content: "We are currently performing scheduled maintenance.",
    icon: Construction,
    title: "Under Maintenance",
    variant: "destructive",
  },
  offline: {
    content: "Check your internet connection.",
    icon: CloudOff,
    title: "You are offline",
    variant: "destructive",
  },
  session_invalidated: {
    content: "Session expired or active elsewhere. Please sign in.",
    icon: KeyRound,
    title: "Logged Out",
    variant: "destructive",
  },
} as const;

export type AlertKeys = keyof typeof downAlertConfig;

export const DownAlert = () => {
  const { isOnline } = useOnlineManager();
  const { downAlert, setDownAlert } = useAlertStore();
  const [dismissedAlerts, setDismissedAlerts] = useState<
    Record<string, boolean>
  >({});

  const dismissAlert = useCallback(() => {
    if (!downAlert) {
      return;
    }
    setDismissedAlerts((prev) => ({ ...prev, [downAlert]: true }));
    setDownAlert(null);
  }, [downAlert, setDownAlert]);

  const resetDismiss = useCallback((key: AlertKeys) => {
    setDismissedAlerts((prev) => ({ ...prev, [key]: false }));
  }, []);

  useEffect(() => {
    if (isOnline) {
      if (downAlert === "offline") {
        setDownAlert(null);
      }
      resetDismiss("offline");
    } else {
      setDownAlert("offline");
    }
  }, [downAlert, isOnline, setDownAlert, resetDismiss]);

  if (!downAlert || dismissedAlerts[downAlert]) {
    return null;
  }

  const config = downAlertConfig[downAlert];
  if (!config) {
    return null;
  }

  const { title, content, icon: Icon, variant } = config;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 flex pointer-events-auto justify-center">
      <Alert
        className="w-auto shadow-lg bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
        variant={variant}
      >
        <Button
          className="absolute top-1 right-1 h-6 w-6 p-0 hover:bg-transparent"
          onClick={dismissAlert}
          size="sm"
          variant="ghost"
        >
          <X size={16} />
          <span className="sr-only">Dismiss</span>
        </Button>

        <Icon size={16} />
        <AlertDescription className="flex items-center gap-2 pr-6 font-light">
          <span className="font-semibold">{title}</span>
          <span className="mx-1 opacity-50">&#183;</span>
          <span>{content}</span>
        </AlertDescription>
      </Alert>
    </div>
  );
};
