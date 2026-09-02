import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  activateUser,
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  unlockUser,
  updateUser,
  updateUserRoles,
} from "@/api.gen/sdk.gen";
import type {
  CreateUserData,
  ListUsersData,
  UpdateUserData,
  UpdateUserRolesData,
} from "@/api.gen/types.gen";

export const usersKeys = {
  all: ["users"] as const,
  detail: (id: string) => [...usersKeys.details(), id] as const,
  details: () => [...usersKeys.all, "detail"] as const,
  list: (params: ListUsersData["query"]) =>
    [...usersKeys.lists(), params] as const,
  lists: () => [...usersKeys.all, "list"] as const,
};

export function usersListQueryOptions(
  params: NonNullable<ListUsersData["query"]>
) {
  return queryOptions({
    queryFn: async () => {
      const response = await listUsers({ query: params });
      return response;
    },
    queryKey: usersKeys.list(params),
  });
}

export function useUsersQuery(params: NonNullable<ListUsersData["query"]>) {
  return useQuery({
    ...usersListQueryOptions(params),
    placeholderData: (prev) => prev,
  });
}

export function useUserQuery(userId: string) {
  return useQuery({
    enabled: Boolean(userId),
    queryFn: async () => {
      const response = await getUser({ path: { userId } });
      return response.user;
    },
    queryKey: usersKeys.detail(userId),
  });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateUserData["body"]) => {
      const response = await createUser({ body: data });
      return response.user;
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      toast.success("User created successfully");
    },
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateUserData["body"];
    }) => {
      const response = await updateUser({ body: data, path: { userId } });
      return response.user;
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update user");
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      toast.success("User updated successfully");
    },
  });
}

export function useUpdateUserRolesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: string;
      data: UpdateUserRolesData["body"];
    }) => {
      const response = await updateUserRoles({ body: data, path: { userId } });
      return response.user;
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update roles");
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      queryClient.invalidateQueries({
        queryKey: ["authorization", "capabilities"],
      });
      toast.success("Roles updated successfully");
    },
  });
}

export function useDeactivateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      reason,
    }: {
      userId: string;
      reason?: string;
    }) => {
      await deactivateUser({ body: { reason }, path: { userId } });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to deactivate user");
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      queryClient.invalidateQueries({
        queryKey: ["authorization", "capabilities"],
      });
      toast.success("User deactivated");
    },
  });
}

export function useActivateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await activateUser({ path: { userId } });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to activate user");
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      queryClient.invalidateQueries({
        queryKey: ["authorization", "capabilities"],
      });
      toast.success("User activated");
    },
  });
}

export function useUnlockUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await unlockUser({ path: { userId } });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to unlock user");
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: usersKeys.detail(userId) });
      queryClient.invalidateQueries({
        queryKey: ["authorization", "capabilities"],
      });
      toast.success("User unlocked");
    },
  });
}
