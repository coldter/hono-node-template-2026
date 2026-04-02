import capabilitiesHandler from "@/auth/capabilities";
import { auditLogsHandler } from "@/modules/audit-logs";
import authRouteHandler from "@/modules/auth/handler";
import rolesHandler from "@/modules/auth/roles/handler";
import { notificationsHandler } from "@/modules/notifications";
import { statusHandler } from "@/modules/status";
import usersHandler from "@/modules/users/handler";
import baseApp from "@/server";

export const app = baseApp
  .route("/api/auth", authRouteHandler)
  .route("/api/authorization/capabilities", capabilitiesHandler)
  .route("/api/audit-logs", auditLogsHandler)
  .route("/api/notifications", notificationsHandler)
  .route("/api/roles", rolesHandler)
  .route("/api/status", statusHandler)
  .route("/api/users", usersHandler);
