import type { HttpBindings } from "@hono/node-server";
import type { Principal } from "@repo/authorization";
import type { RequestIdVariables } from "hono/request-id";
import type { AuditContext } from "@/lib/audit-context";
import type { auth } from "@/modules/auth/instance";

type Bindings = HttpBindings & {};

export type Env = {
  Variables: RequestIdVariables & {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    principal: Principal | null;
    otel: { traceId: string | null; spanId: string | null } | null;
    auditContext: AuditContext;
  };
  Bindings: Bindings;
};
