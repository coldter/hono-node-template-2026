import { createFileRoute } from "@tanstack/react-router";

import { Authorized } from "@/components/authorized";
import { PermissionDenied } from "@/modules/permissions";
import { UserDetailPage } from "@/modules/users/pages/user-detail-page";

export const Route = createFileRoute("/(protected)/users/$userId")({
  component: () => (
    <Authorized
      capability="user:view"
      fallback={<PermissionDenied requiredPermission="user:view" />}
    >
      <UserDetailPage />
    </Authorized>
  ),
});
