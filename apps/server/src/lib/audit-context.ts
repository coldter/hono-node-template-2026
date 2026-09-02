import type { Context } from "hono";
import { env } from "@/env";
import { resolveClientIpFromParts } from "@/lib/ip";

export type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

export function extractAuditContext(c: Context): AuditContext {
  const ipAddress = resolveClientIpFromParts({
    forwardedFor: c.req.header("x-forwarded-for") ?? null,
    realIp: c.req.header("x-real-ip") ?? null,
    trustProxy: env.TRUST_PROXY,
  });
  return {
    ipAddress: ipAddress ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  };
}
