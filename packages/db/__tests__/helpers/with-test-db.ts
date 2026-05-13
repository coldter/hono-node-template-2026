import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";

export type WithTestDbFn = (pg: Client) => Promise<void>;

/**
 * Spins up a postgres:18-alpine testcontainer, applies all migrations in
 * timestamp order, calls fn with the connected Client, then tears down.
 *
 * Migration files are split on Drizzle's "--> statement-breakpoint" delimiter.
 * Dirs without a migration.sql are silently skipped (e.g. snapshot-only dirs).
 */
export async function withTestDb(fn: WithTestDbFn): Promise<void> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:18-alpine"
  ).start();
  const pg = new Client({ connectionString: container.getConnectionUri() });
  await pg.connect();
  try {
    const migrationsDir = join(import.meta.dirname, "../../src/migrations");
    const dirs = readdirSync(migrationsDir).sort();
    for (const dir of dirs) {
      try {
        const sql = readFileSync(
          join(migrationsDir, dir, "migration.sql"),
          "utf-8"
        );
        const statements = sql
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const stmt of statements) {
          await pg.query(stmt);
        }
      } catch {
        // skip dirs without migration.sql
      }
    }
    await fn(pg);
  } finally {
    await pg.end();
    await container.stop();
  }
}
