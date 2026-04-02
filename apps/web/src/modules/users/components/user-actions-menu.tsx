import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useAuthorization } from "@/hooks/use-authorization";
import { Button } from "@/modules/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/modules/ui/dropdown-menu";
import { DeactivateDialog } from "../dialogs/deactivate-dialog";
import { EditUserDialog } from "../dialogs/edit-user-dialog";
import { RoleAssignmentDialog } from "../dialogs/role-assignment-dialog";
import { useActivateUserMutation, useUnlockUserMutation } from "../query";
import type { User, UserDetail, UserStatus } from "../types";

interface UserActionsMenuProps {
  user: User | UserDetail;
}

export function UserActionsMenu({ user }: UserActionsMenuProps) {
  const { capabilities } = useAuthorization();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showRolesDialog, setShowRolesDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  const activateMutation = useActivateUserMutation();
  const unlockMutation = useUnlockUserMutation();

  const canUpdate = capabilities["user:update"] === true;
  const canDeactivate = capabilities["user:deactivate"] === true;
  const canActivate = capabilities["user:activate"] === true;
  const canUnlock = capabilities["user:unlock"] === true;

  const status = user.status as UserStatus;

  const handleActivate = () => {
    activateMutation.mutate(user.id);
  };

  const handleUnlock = () => {
    unlockMutation.mutate(user.id);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canUpdate && (
            <>
              <DropdownMenuItem onSelect={() => setShowEditDialog(true)}>
                Edit profile
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowRolesDialog(true)}>
                Manage roles
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {status === "active" && canDeactivate && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setShowDeactivateDialog(true)}
            >
              Deactivate
            </DropdownMenuItem>
          )}

          {status === "inactive" && canActivate && (
            <DropdownMenuItem onSelect={handleActivate}>
              Activate
            </DropdownMenuItem>
          )}

          {status === "locked" && canUnlock && (
            <DropdownMenuItem onSelect={handleUnlock}>Unlock</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog
        onOpenChange={setShowEditDialog}
        open={showEditDialog}
        user={user}
      />

      <RoleAssignmentDialog
        onOpenChange={setShowRolesDialog}
        open={showRolesDialog}
        user={user}
      />

      <DeactivateDialog
        onOpenChange={setShowDeactivateDialog}
        open={showDeactivateDialog}
        user={user}
      />
    </>
  );
}
