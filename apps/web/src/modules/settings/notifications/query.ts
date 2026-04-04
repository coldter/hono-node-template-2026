import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/api.gen/sdk.gen";
import type { UpdateNotificationPreferencesData } from "@/api.gen/types.gen";

export const notificationPreferencesKeys = {
  all: ["notification-preferences"] as const,
  detail: () => [...notificationPreferencesKeys.all, "detail"] as const,
};

export function useNotificationPreferencesQuery() {
  return useQuery({
    queryKey: notificationPreferencesKeys.detail(),
    queryFn: async ({ signal }) => {
      const response = await getNotificationPreferences({ signal });
      return response.preferences;
    },
  });
}

export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      data: NonNullable<UpdateNotificationPreferencesData["body"]>
    ) => {
      const response = await updateNotificationPreferences({ body: data });
      return response.preferences;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationPreferencesKeys.all,
      });
      toast.success("Notification preferences updated");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update preferences");
    },
  });
}
