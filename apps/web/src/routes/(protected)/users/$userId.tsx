import { createFileRoute } from "@tanstack/react-router";

import { PERMISSIONS, Protected } from "@/modules/permissions";
import { UserDetailPage } from "@/modules/users/pages/user-detail-page";

export const Route = createFileRoute("/(protected)/users/$userId")({
  component: () => (
    <Protected permission={PERMISSIONS.USERS.VIEW}>
      <UserDetailPage />
    </Protected>
  ),
});
