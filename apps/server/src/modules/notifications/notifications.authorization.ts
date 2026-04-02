import { auth } from "@/auth/schema";

interface NotificationResource {
  id: string;
  userId: string;
}

export const notificationsAuthorization =
  auth.createResource<NotificationResource>("notification", {
    actions: [
      "list",
      "view",
      "mark-read",
      "mark-all-read",
      "get-preferences",
      "update-preferences",
      "list-push-tokens",
      "register-push-token",
      "delete-push-token",
      "get-unread-count",
    ],
    policies: (p) => [p.allow("admin").to("*"), p.allow("user").to("*")],
  });
