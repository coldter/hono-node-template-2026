import type { Context } from "hono";

export type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

export function extractAuditContext(c: Context): AuditContext {
  return {
    ipAddress:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  };
}
