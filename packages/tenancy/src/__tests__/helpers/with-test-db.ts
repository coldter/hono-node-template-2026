import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";

export type WithTestDbFn = (pg: Client) => Promise<void>;

/**
 * Spin up postgres:18-alpine, apply migrations in timestamp order, then
 * tear down. Migration SQL is split on Drizzle's `--> statement-breakpoint`
 * delimiter; snapshot-only dirs without a migration.sql are skipped.
 */
export async function withTestDb(fn: WithTestDbFn): Promise<void> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:18-alpine"
  ).start();
  const pg = new Client({ connectionString: container.getConnectionUri() });
  await pg.connect();
  try {
    const migrationsDir = join(
      import.meta.dirname,
      "../../../../db/src/migrations"
    );
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
