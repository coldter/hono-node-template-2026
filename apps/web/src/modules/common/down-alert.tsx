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
  offline: {
    icon: CloudOff,
    title: "You are offline",
    content: "Check your internet connection.",
    variant: "destructive",
  },
  auth_expired: {
    icon: KeyRound,
    title: "Session Expired",
    content: "Your login has expired. Please sign in again.",
    variant: "destructive",
  },
  session_invalidated: {
    icon: KeyRound,
    title: "Logged Out",
    content: "Session expired or active elsewhere. Please sign in.",
    variant: "destructive",
  },
  auth_unavailable: {
    icon: TriangleAlert,
    title: "Authentication Unavailable",
    content: "We are having trouble connecting to the authentication server.",
    variant: "destructive",
  },
  maintenance: {
    icon: Construction,
    title: "Under Maintenance",
    content: "We are currently performing scheduled maintenance.",
    variant: "destructive",
  },
  forbidden: {
    icon: ShieldAlert,
    title: "Access Denied",
    content: "You do not have permission to access this resource.",
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

  const config = downAlertConfig[downAlert as AlertKeys];
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
