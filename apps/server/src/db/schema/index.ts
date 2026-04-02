// Single source of truth: all schema is defined in @repo/db
// The server drizzle.config.ts and db/index.ts already point to @repo/db/schema.
// This re-export exists only for legacy import paths that may still use @/db/schema.
export * from "@repo/db/schema";
