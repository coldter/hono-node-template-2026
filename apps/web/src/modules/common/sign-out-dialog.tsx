import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { clearSession, resetSessionQuery } from "@/modules/auth/helpers";
import { ConfirmDialog } from "@/modules/common/confirm-dialog";
import { useAlertStore } from "@/store/alert";
import { useUserStore } from "@/store/user";

interface SignOutDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: async () => {
          // Arm the global 401 guard before anything can refetch against the
          // revoked cookie (e.g. a poll firing during the route transition).
          useUserStore.getState().clearUser();
          // Drop only the session entry so the login guard refetches instead
          // of redirecting back on the stale cached session.
          resetSessionQuery();
          // A persisted down alert (e.g. an earlier expiry) must not greet the
          // user on the login page after an intentional sign-out.
          useAlertStore.getState().clearDownAlert();
          await navigate({
            to: "/login",
            replace: true,
          });
          // Only after the protected tree unmounts: clear() refires mounted
          // observers, whose refetches would 401 against the revoked cookie.
          clearSession();
        },
      },
    });
  };

  return (
    <ConfirmDialog
      className="sm:max-w-sm"
      confirmText="Sign out"
      desc="Are you sure you want to sign out? You will need to sign in again to access your account."
      destructive
      handleConfirm={handleSignOut}
      onOpenChange={onOpenChange}
      open={open}
      title="Sign out"
    />
  );
}
