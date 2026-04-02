import { timestamp } from "drizzle-orm/pg-core";

/**
 * Auto-set created timestamp on insert (UTC with timezone).
 * Use for tracking when records are created.
 */
export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/**
 * Auto-update timestamp on change (UTC with timezone).
 * Use for tracking when records are modified.
 */
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
