import { toast } from "sonner";
import * as z from "zod/mini";
import { authClient } from "@/lib/auth-client";

import { clearSession } from "@/modules/auth/helpers";
import { useAlertStore } from "@/store/alert";
import { useUserStore } from "@/store/user";

const FALLBACK_MESSAGES = new Map<number, string>([
  [400, "Bad request. Please check your input."],
  [401, "Your session has expired. Please sign in again."],
  [403, "You do not have permission to perform this action."],
  [404, "The requested resource was not found."],
  [429, "Too many requests. Please slow down."],
  [500, "An internal server error occurred."],
  [502, "Server is temporarily unavailable."],
  [503, "Service is under maintenance."],
  [504, "Request timed out. Please try again."],
]);

const thrownErrorSchema = z.catch(
  z.object({
    error: z.catch(
      z.optional(
        z.object({
          message: z.catch(z.optional(z.string()), undefined),
        })
      ),
      undefined
    ),
    message: z.catch(z.optional(z.string()), undefined),
    path: z.catch(z.optional(z.string()), undefined),
    status: z.catch(z.optional(z.number()), undefined),
  }),
  {}
);

type ErrorDetails = z.infer<typeof thrownErrorSchema>;

const fallbackMessage = (status: number): string =>
  FALLBACK_MESSAGES.get(status) ?? "An unexpected error occurred";

const getErrorMessage = (details: ErrorDetails): string => {
  if (details.error?.message) {
    return details.error.message;
  }

  if (details.message && details.message !== "Error") {
    return details.message;
  }

  return fallbackMessage(details.status ?? 0);
};

const isSessionCheckPath = (path?: string): boolean => {
  if (!path) {
    return false;
  }
  const sessionPaths = ["/api/auth/get-session"];
  return sessionPaths.some((p) => path.includes(p));
};

const handleAuthError = async (): Promise<void> => {
  if (!useUserStore.getState().user) {
    return;
  }
  useAlertStore.getState().setDownAlert("auth_expired");

  try {
    await authClient.signOut();
  } catch {}

  clearSession();

  toast.error("Session expired", {
    description: "Please sign in again to continue.",
  });

  if (!window.location.pathname.startsWith("/login")) {
    const currentPath = window.location.pathname + window.location.search;
    const redirectUrl =
      currentPath && currentPath !== "/"
        ? `/login?redirect=${encodeURIComponent(currentPath)}`
        : "/login";

    window.location.href = redirectUrl;
  }
};

export const handleGlobalError = async (error: Error): Promise<void> => {
  console.error("Global query/mutation error:", error);

  const details = thrownErrorSchema.parse(error);
  const statusCode = details.status ?? 0;
  const isCasualSessionCheck = isSessionCheckPath(details.path);

  switch (statusCode) {
    case 502:
    case 503:
      useAlertStore.getState().setDownAlert("maintenance");
      toast.error("Maintenance", {
        description: "The service is temporarily unavailable.",
      });
      return;

    case 504:
      useAlertStore.getState().setDownAlert("offline");
      return;

    case 500:
      if (isCasualSessionCheck) {
        useAlertStore.getState().setDownAlert("auth_unavailable");
        return;
      }
      toast.error("Server Error", {
        description: getErrorMessage(details),
      });
      return;

    case 401:
      await handleAuthError();
      return;

    case 403:
      useAlertStore.getState().setDownAlert("forbidden");
      toast.error("Access Denied", {
        description: getErrorMessage(details),
      });
      return;

    default:
      if (statusCode >= 400) {
        toast.error("Error", {
          description: getErrorMessage(details),
        });
      }
  }
};

export const handleGlobalSuccess = (): void => {
  const { downAlert, clearDownAlert } = useAlertStore.getState();

  if (
    downAlert &&
    ["maintenance", "offline", "auth_unavailable"].includes(downAlert)
  ) {
    clearDownAlert();
  }
};
