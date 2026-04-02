import { auditLogsAuthorization } from "@/modules/audit-logs/audit-logs.authorization";
import { notificationsAuthorization } from "@/modules/notifications/notifications.authorization";
import { rolesAuthorization } from "@/modules/roles/roles.authorization";
import { usersAuthorization } from "@/modules/users/users.authorization";
import { auth } from "./schema";

export const authorization = auth.buildRegistry({
  user: usersAuthorization,
  role: rolesAuthorization,
  "audit-log": auditLogsAuthorization,
  notification: notificationsAuthorization,
});
