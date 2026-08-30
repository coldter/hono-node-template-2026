import { createFileRoute } from "@tanstack/react-router";

import * as z from "zod/mini";

import { Authorized } from "@/components/authorized";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";
import { PermissionDenied } from "@/modules/permissions";
import { UsersPage } from "@/modules/users/pages/users-page";
import { usersListQueryOptions } from "@/modules/users/query";

export const usersSearchSchema = z.object({
  order: z.optional(z.enum(["asc", "desc"])),
  page: z.catch(z.optional(z.number()), 1),
  perPage: z.catch(z.optional(z.number()), 20),
  role: z.optional(z.string()),
  search: z.optional(z.string()),
  sort: z.optional(z.string()),
  status: z.optional(z.enum(["active", "inactive", "locked"])),
});

export type UsersSearch = z.infer<typeof usersSearchSchema>;

function usersListParams(search: UsersSearch) {
  return {
    order: search.order ?? ("desc" as const),
    page: Math.max(1, search.page ?? 1),

    perPage: 20,
    role: search.role,
    search: search.search,
    sort: search.sort ?? "createdAt",
    status: search.status,
  };
}

export const Route = createFileRoute("/(protected)/users/")({
  component: () => (
    <Authorized
      capability="user:list"
      fallback={<PermissionDenied requiredPermission="user:list" />}
    >
      <UsersPage />
    </Authorized>
  ),
  loader: async ({ context, deps }) => {
    const { queryClient } = context;

    await queryClient.prefetchQuery(capabilitiesQueryOptions);
    const capabilities = queryClient.getQueryData(
      capabilitiesQueryOptions.queryKey
    );
    if (capabilities?.["user:list"]) {
      await queryClient.prefetchQuery(
        usersListQueryOptions(usersListParams(deps))
      );
    }
  },
  loaderDeps: ({ search }) => search,
  validateSearch: usersSearchSchema,
});
