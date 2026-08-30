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
      const fieldKey = String(field);
      changes[fieldKey] = {
        from: beforeValue,
        to: afterValue,
      };
      changedFields.push(fieldKey);
    }
  }

  return { changedFields, changes };
}
