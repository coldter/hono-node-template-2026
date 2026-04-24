// Single source of truth: all schema is defined in @repo/db.
// The server drizzle.config.ts writes migrations to packages/db/src/migrations.
// This re-export exists only for legacy import paths that may still use @/db/schema.
export * from "@repo/db/schema";
