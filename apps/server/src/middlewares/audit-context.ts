import {
  buildAuditContextMiddleware,
  extractAuditContext,
} from "@repo/hono-app";

import type { Env } from "@/lib/context";

export const auditContextMiddleware =
  buildAuditContextMiddleware<Env>(extractAuditContext);
