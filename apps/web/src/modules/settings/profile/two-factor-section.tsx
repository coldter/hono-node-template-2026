import { ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { PasswordInput } from "@/modules/common/password-input";
import { Badge } from "@/modules/ui/badge";
import { Button } from "@/modules/ui/button";
import { Label } from "@/modules/ui/label";
import { useUserStore } from "@/store/user";

type ConfirmAction = "enable" | "disable" | null;

function getConfirmButtonLabel(action: "enable" | "disable", loading: boolean) {
  if (action === "enable") {
    return loading ? "Enabling..." : "Confirm enable";
  }
  return loading ? "Disabling..." : "Confirm disable";
}

export function TwoFactorSection() {
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);
  const isEnabled = user?.twoFactorEnabled ?? false;

  const [isLoading, setIsLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [password, setPassword] = useState("");

  function resetConfirm() {
    setConfirmAction(null);
    setPassword("");
  }

  async function handleEnable() {
    if (!password) {
      toast.error("Password is required to enable 2FA");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await authClient.twoFactor.enable({
        password,
      });

      if (error) {
        toast.error(error.message || "Failed to enable 2FA");
        return;
      }

      updateUser({ twoFactorEnabled: true });
      resetConfirm();
      toast.success("Two-factor authentication enabled");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisable() {
    if (!password) {
      toast.error("Password is required to disable 2FA");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await authClient.twoFactor.disable({
        password,
      });

      if (error) {
        toast.error(error.message || "Failed to disable 2FA");
        return;
      }

      updateUser({ twoFactorEnabled: false });
      resetConfirm();
      toast.success("Two-factor authentication disabled");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4 rounded-lg border p-4">
        <div className="text-muted-foreground mt-0.5">
          {isEnabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium leading-none">
              Two-factor authentication
            </p>
            <Badge variant={isEnabled ? "default" : "outline"}>
              {isEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {isEnabled
              ? "Your account is protected with email verification codes on sign-in."
              : "Add an extra layer of security by requiring a verification code sent to your email on sign-in."}
          </p>
        </div>
        {!confirmAction && (
          <Button
            className="shrink-0"
            onClick={() => setConfirmAction(isEnabled ? "disable" : "enable")}
            size="sm"
            variant={isEnabled ? "outline" : "default"}
          >
            {isEnabled ? "Disable" : "Enable"}
          </Button>
        )}
      </div>

      {confirmAction && (
        <div className="ml-9 space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">
            Enter your password to {confirmAction} two-factor authentication.
          </p>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="2fa-password">Password</Label>
            <PasswordInput
              id="2fa-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              value={password}
            />
          </div>
          <div className="flex gap-2">
            <Button
              disabled={isLoading || !password}
              onClick={
                confirmAction === "enable" ? handleEnable : handleDisable
              }
              size="sm"
              variant={confirmAction === "disable" ? "destructive" : "default"}
            >
              {getConfirmButtonLabel(confirmAction, isLoading)}
            </Button>
            <Button onClick={resetConfirm} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
