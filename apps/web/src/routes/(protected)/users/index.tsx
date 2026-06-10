import { createFileRoute } from "@tanstack/react-router";
// zod/mini: autoCodeSplitting cannot extract validateSearch, so classic zod
// here would ship in the eager entry chunk for every visitor.
import * as z from "zod/mini";

import { Authorized } from "@/components/authorized";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";
import { PermissionDenied } from "@/modules/permissions";
import { UsersPage } from "@/modules/users/pages/users-page";
import { usersListQueryOptions } from "@/modules/users/query";

export const usersSearchSchema = z.object({
  page: z.catch(z.optional(z.number()), 1),
  perPage: z.catch(z.optional(z.number()), 20),
  sort: z.optional(z.string()),
  order: z.optional(z.enum(["asc", "desc"])),
  search: z.optional(z.string()),
  status: z.optional(z.enum(["active", "inactive", "locked"])),
  role: z.optional(z.string()),
});

export type UsersSearch = z.infer<typeof usersSearchSchema>;

// Must mirror UsersTable's useTableUrlState derivation exactly; a different
// params object changes the query key and the loader's fetch is wasted.
function usersListParams(search: UsersSearch) {
  return {
    page: Math.max(1, search.page ?? 1),
    // useTableUrlState reads the "pageSize" search key, which this schema does
    // not define, so the table always fetches the default page size.
    perPage: 20,
    sort: search.sort ?? "createdAt",
    order: search.order ?? ("desc" as const),
    search: search.search,
    status: search.status,
    role: search.role,
  };
}

export const Route = createFileRoute("/(protected)/users/")({
  validateSearch: (search) => usersSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    // prefetchQuery (not ensureQueryData) so fetch failures keep rendering the
    // inline TableError instead of replacing the page with the errorComponent.
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
  component: () => (
    <Authorized
      capability="user:list"
      fallback={<PermissionDenied requiredPermission="user:list" />}
    >
      <UsersPage />
    </Authorized>
  ),
});
