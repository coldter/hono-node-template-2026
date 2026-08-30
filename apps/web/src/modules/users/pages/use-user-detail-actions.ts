import { useState } from "react";
import { useAuthorization } from "@/hooks/use-authorization";
import { useUserStore } from "@/store/user";
import { useActivateUserMutation, useUnlockUserMutation } from "../query";
import type { UserStatus } from "../types";

interface UseUserDetailActionsParams {
  status: UserStatus | undefined;
  userId: string | undefined;
}

export function useUserDetailActions({
  userId,
  status,
}: UseUserDetailActionsParams) {
  const { capabilities } = useAuthorization();
  const currentUser = useUserStore((s) => s.user);
  const hasAdminRole = currentUser?.roleSlugs?.includes("admin") ?? false;
  const isOwnProfile = currentUser?.id === userId;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showRolesDialog, setShowRolesDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  const activateMutation = useActivateUserMutation();
  const unlockMutation = useUnlockUserMutation();

  const canEditProfile =
    Boolean(userId) &&
    capabilities["user:update"] &&
    (hasAdminRole || isOwnProfile);
  const canManageRoles = canEditProfile && hasAdminRole;
  const canDeactivate =
    Boolean(userId) &&
    status === "active" &&
    capabilities["user:deactivate"] &&
    !isOwnProfile;
  const canActivate =
    Boolean(userId) && status === "inactive" && capabilities["user:activate"];
  const canUnlock =
    Boolean(userId) && status === "locked" && capabilities["user:unlock"];

  function handleActivate() {
    if (!userId) {
      throw new Error("Cannot activate user without a user ID");
    }
    activateMutation.mutate(userId);
  }

  function handleUnlock() {
    if (!userId) {
      throw new Error("Cannot unlock user without a user ID");
    }
    unlockMutation.mutate(userId);
  }

  return {
    activateMutation,
    canActivate,
    canDeactivate,
    canEditProfile,
    canManageRoles,
    canUnlock,
    handleActivate,
    handleUnlock,
    hasAdminRole,
    isOwnProfile,
    setShowDeactivateDialog,
    setShowEditDialog,
    setShowRolesDialog,
    showDeactivateDialog,
    showEditDialog,
    showRolesDialog,
    unlockMutation,
  };
}
