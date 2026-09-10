import type { AuditLogMetadata, FieldChange } from "@/modules/audit-logs/types";

export function createChangeMetadata<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T & string)[]
): AuditLogMetadata {
  const changes: Record<string, FieldChange> = {};
  const changedFields: string[] = [];

  for (const field of fields) {
    const beforeValue = before[field];
    const afterValue = after[field];

    if (afterValue !== undefined && beforeValue !== afterValue) {
      changes[field] = {
        from: beforeValue,
        to: afterValue,
      };
      changedFields.push(field);
    }
  }

  return { changedFields, changes };
}
