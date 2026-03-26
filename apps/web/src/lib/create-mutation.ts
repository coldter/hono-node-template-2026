import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface CreateMutationOptions<TData, TVariables, TContext = unknown> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onError?: {
    message?: string;
  };
  onSuccess?: {
    invalidate?: readonly unknown[][];
    message?: string;
    callback?: (data: TData, variables: TVariables, context: TContext) => void;
  };
}

export function useSimpleMutation<TData, TVariables>({
  mutationFn,
  onSuccess,
  onError,
}: CreateMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      if (onSuccess?.invalidate) {
        for (const key of onSuccess.invalidate) {
          queryClient.invalidateQueries({ queryKey: key as unknown[] });
        }
      }
      if (onSuccess?.message) {
        toast.success(onSuccess.message);
      }
      onSuccess?.callback?.(data, variables, context);
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : (onError?.message ?? "Something went wrong");
      toast.error(message);
    },
  });
}
