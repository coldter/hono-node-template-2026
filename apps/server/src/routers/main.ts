import { auditLogsHandler } from "@/modules/audit-logs";
import authRouteHandler from "@/modules/auth/handler";
import { notificationsHandler } from "@/modules/notifications";
import { statusHandler } from "@/modules/status";
import { usersHandler } from "@/modules/users";
import baseApp from "@/server";

export const app = baseApp
  .route("/api/auth", authRouteHandler)
  .route("/api/audit-logs", auditLogsHandler)
  .route("/api/notifications", notificationsHandler)
  .route("/api/status", statusHandler)
  .route("/api/users", usersHandler);
