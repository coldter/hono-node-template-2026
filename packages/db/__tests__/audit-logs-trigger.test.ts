import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APPEND_ONLY_RE = /append-only/;

let pg: Client;
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  pg = new Client({ connectionString: container.getConnectionUri() });
  await pg.connect();
  const migrationsDir = join(import.meta.dirname, "../src/migrations");
  const dirs = readdirSync(migrationsDir).sort();
  for (const dir of dirs) {
    try {
      const sql = readFileSync(
        join(migrationsDir, dir, "migration.sql"),
        "utf-8"
      );
      // Drizzle emits `--> statement-breakpoint` between statements; pg.query
      // cannot run a multi-statement string for DDL with parameterised SQL.
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await pg.query(stmt);
      }
    } catch {
      /* skip dirs without migration.sql */
    }
  }
}, 120_000);

afterAll(async () => {
  await pg.end();
  await container.stop();
});

describe("audit_logs append-only trigger", () => {
  it("rejects UPDATE", async () => {
    await pg.query(
      `INSERT INTO audit_logs (id, event, actor_id, actor_type, organization_id) VALUES ('al_1','test.event','u_1','USER','o_1')`
    );
    await expect(
      pg.query(`UPDATE audit_logs SET event='other' WHERE id='al_1'`)
    ).rejects.toThrow(APPEND_ONLY_RE);
  });
  it("rejects DELETE", async () => {
    await expect(
      pg.query(`DELETE FROM audit_logs WHERE id='al_1'`)
    ).rejects.toThrow(APPEND_ONLY_RE);
  });
});
