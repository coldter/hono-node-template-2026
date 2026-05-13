import {
  buildAuditContextMiddleware,
  extractAuditContext,
} from "@repo/hono-app";
import type { Env } from "@/lib/context";

/**
 * Writes `requestContext.audit`. Operator audit lines downstream consume
 * the same shape as tenant audit lines, so the default HTTP extractor is
 * sufficient at the scaffold stage.
 */
export const auditContextMiddleware =
  buildAuditContextMiddleware<Env>(extractAuditContext);
