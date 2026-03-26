import type { Context } from "hono";

import type { Env } from "@/lib/context";

import { auditLogService } from "./service";
import type {
  AuditEventObject,
  AuditLogMetadata,
  FieldChange,
  TargetType,
} from "./types";

interface DiffOptions {
  include?: string[];
  redact?: string[];
}

interface DiffResult {
  changedFields: string[];
  changes: Record<string, FieldChange>;
  hasChanges: boolean;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (a === null || b === null) {
    return a === b;
  }
  if (typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export function diffObjects<T extends Record<string, unknown>>(
  before: T,
  after: T,
  options?: DiffOptions
): DiffResult {
  const changes: Record<string, FieldChange> = {};
  const changedFields: string[] = [];
  const redactSet = new Set(options?.redact ?? []);
  const keys = options?.include ?? [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ];

  for (const key of keys) {
    if (redactSet.has(key)) {
      continue;
    }
    const fromVal = before[key];
    const toVal = after[key];
    if (!isEqual(fromVal, toVal)) {
      changes[key] = { from: fromVal, to: toVal };
      changedFields.push(key);
    }
  }

  return { changes, changedFields, hasChanges: changedFields.length > 0 };
}

interface AuditLogTarget {
  id: string;
  type: TargetType;
}

interface AuditLogChanges<T extends Record<string, unknown>> {
  after: T;
  before: T;
  include?: string[];
  redact?: string[];
}

interface AuditLogOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  changes?: AuditLogChanges<T>;
  metadata?: Record<string, unknown>;
  target?: AuditLogTarget;
}

export async function auditLog<T extends Record<string, unknown>>(
  c: Context<Env>,
  event: AuditEventObject,
  options: AuditLogOptions<T> = {}
): Promise<void> {
  const { target, changes, metadata = {} } = options;
  const user = c.get("user");

  const finalMetadata: AuditLogMetadata = { ...metadata };

  if (changes) {
    const diff = diffObjects(changes.before, changes.after, {
      redact: changes.redact,
      include: changes.include,
    });
    if (diff.hasChanges) {
      finalMetadata.changes = diff.changes;
      finalMetadata.changedFields = diff.changedFields;
    }
  }

  try {
    await auditLogService.create({
      event: event.event,
      actorId: user?.id,
      actorType: "user",
      targetId: target?.id,
      targetType: target?.type,
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip"),
      userAgent: c.req.header("user-agent"),
      metadata:
        Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}
