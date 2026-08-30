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
          useUserStore.getState().clearUser();

          resetSessionQuery();

          useAlertStore.getState().clearDownAlert();
          await navigate({
            replace: true,
            to: "/login",
          });

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
