import { createMiddleware } from "hono/factory";

import { extractAuditContext } from "@/lib/audit-context";
import type { Env } from "@/lib/context";

export const auditContextMiddleware = createMiddleware<Env>(async (c, next) => {
  c.set("auditContext", extractAuditContext(c));
  await next();
});
