import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { clearSession } from "@/modules/auth";
import { ConfirmDialog } from "@/modules/common/confirm-dialog";
import { queryClient } from "@/query/query-client";
import { sessionQueryOptions } from "@/query/session-query";

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
          clearSession();
          await queryClient.invalidateQueries({
            queryKey: sessionQueryOptions.queryKey,
          });
          navigate({
            to: "/login",
            replace: true,
          });
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
