import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home, LogOut, ShieldX } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { clearSession } from "@/modules/auth";
import { Button } from "@/modules/ui/button";

interface PermissionDeniedProps {
  children?: React.ReactNode;
  message?: string;
  requiredPermission?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
  showLogoutButton?: boolean;
  title?: string;
}

export function PermissionDenied({
  title = "Access Denied",
  message = "You don't have the required permissions to access this resource.",
  requiredPermission,
  showBackButton = true,
  showHomeButton = true,
  showLogoutButton = false,
  children,
}: PermissionDeniedProps) {
  const navigate = useNavigate();
  const { history } = useRouter();

  const handleLogout = async () => {
    await authClient.signOut();
    clearSession();
    navigate({ to: "/login" });
  };

  const handleGoBack = () => {
    history.go(-1);
  };

  const handleGoHome = () => {
    navigate({ to: "/" });
  };

  return (
    <div className="flex h-svh w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6 px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <ShieldX className="h-10 w-10 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="max-w-md text-muted-foreground">{message}</p>
        </div>

        {requiredPermission ? (
          <p className="text-sm text-muted-foreground">
            Required permission:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {requiredPermission}
            </code>
          </p>
        ) : null}

        {children}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {showBackButton ? (
            <Button onClick={handleGoBack} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          ) : null}

          {showHomeButton ? (
            <Button onClick={handleGoHome} variant="outline">
              <Home className="mr-2 h-4 w-4" />
              Home
            </Button>
          ) : null}

          {showLogoutButton ? (
            <Button onClick={handleLogout} variant="secondary">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
}
