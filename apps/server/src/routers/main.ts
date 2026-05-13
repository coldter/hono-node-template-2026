import capabilitiesHandler from "@/auth/capabilities";
import { auditLogsHandler } from "@/modules/audit-logs";
import rolesHandler from "@/modules/auth/roles/handler";
import { notificationsHandler } from "@/modules/notifications";
import { statusHandler } from "@/modules/status";
import currentTenancyRouter from "@/modules/tenancy/current";
import customHostnameRoutesHandler from "@/modules/tenancy/routes";
import usersHandler from "@/modules/users/handler";
import baseApp from "@/server";

// `/api/auth/*` is served by the sanitized Better Auth proxy mounted on
// `baseApp`. No sub-router is registered here so the proxy is the single
// entry point for every BA endpoint.
export const app = baseApp
  .route("/api/authorization/capabilities", capabilitiesHandler)
  .route("/api/audit-logs", auditLogsHandler)
  .route("/api/notifications", notificationsHandler)
  .route("/api/roles", rolesHandler)
  .route("/api/status", statusHandler)
  .route("/api/tenancy/current", currentTenancyRouter)
  .route("/api/tenancy/hostnames", customHostnameRoutesHandler)
  .route("/api/users", usersHandler);
