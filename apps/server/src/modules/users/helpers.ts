import type { Context } from "hono";

import type { AuditLogMetadata, FieldChange } from "@/modules/audit-logs/types";

export function createChangeMetadata<T extends Record<string, unknown>>(
  before: T,
  after: Partial<Record<keyof T, unknown>>,
  fields: (keyof T)[]
): AuditLogMetadata {
  const changes: Record<string, FieldChange> = {};
  const changedFields: string[] = [];

  for (const field of fields) {
    const beforeValue = before[field];
    const afterValue = after[field];

    if (afterValue !== undefined && beforeValue !== afterValue) {
      changes[field as string] = {
        from: beforeValue,
        to: afterValue,
      };
      changedFields.push(field as string);
    }
  }

  return { changes, changedFields };
}

export function getRequestContext(c: Context): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  return {
    ipAddress:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  };
}
