import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { PERMISSIONS, Protected } from "@/modules/permissions";
import { UsersPage } from "@/modules/users/pages/users-page";

export const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  perPage: z.number().optional().catch(20),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  status: z.enum(["active", "inactive", "locked"]).optional(),
  role: z.string().optional(),
});

export type UsersSearch = z.infer<typeof usersSearchSchema>;

export const Route = createFileRoute("/(protected)/users/")({
  validateSearch: (search) => usersSearchSchema.parse(search),
  component: () => (
    <Protected permission={PERMISSIONS.USERS.VIEW}>
      <UsersPage />
    </Protected>
  ),
});
