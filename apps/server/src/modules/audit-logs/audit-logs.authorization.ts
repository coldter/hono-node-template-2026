import { auth } from "@/auth/schema";

interface AuditLogResource {
  action: string;
  actorId: string | null;
  id: string;
}

export const auditLogsAuthorization = auth.createResource<AuditLogResource>(
  "audit-log",
  {
    actions: ["list", "view"],
    policies: (p) => [p.allow("admin").to("*")],
  }
);
