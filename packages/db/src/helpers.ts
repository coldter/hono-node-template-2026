import { timestamp } from "drizzle-orm/pg-core";

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

// Prefer this over `array[0]!` for guaranteed-non-empty query results.
export function firstOrThrow<T>(
  rows: readonly T[],
  message = "Expected at least one row"
): T {
  const [first] = rows;
  if (first === undefined) {
    throw new Error(message);
  }
  return first;
}
