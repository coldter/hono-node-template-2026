/**
 * Drift detection test: asserts that the schema files and the migration
 * snapshot history are in sync. Fails when a developer edits a schema file
 * without running `db:generate` to produce the corresponding migration.
 *
 * Implementation notes:
 * - `drizzle-kit check` in drizzle 1.0 RC compares migration-to-migration
 *   snapshot hashes. It does NOT compare live schema files vs the latest
 *   snapshot, so it cannot detect schema↔migration drift.
 * - The approach here copies the migrations directory (with its snapshots) to
 *   a temporary location, then runs `drizzle-kit generate` pointing at that
 *   temp dir. If the schema files differ from the latest snapshot, drizzle-kit
 *   will emit a new migration file. An increase in file count means drift.
 * - No live database is required. drizzle-kit resolves the schema purely from
 *   the TypeScript source files and compares against the snapshot.
 * - drizzle-kit is resolved from `apps/server/node_modules/.bin/drizzle-kit`
 *   because the `drizzle-kit` package lives in `apps/server`, not `@repo/db`.
 *   The temp config uses absolute paths so the binary can locate schema files
 *   regardless of cwd.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname.replace(
  /\/$/,
  ""
);

const DRIZZLE_KIT_BIN = join(
  REPO_ROOT,
  "apps/server/node_modules/.bin/drizzle-kit"
);

const MIGRATIONS_SRC = join(REPO_ROOT, "packages/db/src/migrations");
const SCHEMA_PATH = join(REPO_ROOT, "packages/db/src/schema/index.ts");

describe("drizzle-kit drift", () => {
  it("schema and migrations are in sync (no pending generate)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "drizzle-parity-"));
    const tempOut = join(tempDir, "migrations");
    const tempConfig = join(tempDir, "drizzle-parity.config.ts");

    try {
      cpSync(MIGRATIONS_SRC, tempOut, { recursive: true });

      // Absolute paths so drizzle-kit resolves the schema regardless of cwd.
      const configContent = [
        `import { defineConfig } from "${join(REPO_ROOT, "apps/server/node_modules/drizzle-kit")}";`,
        "export default defineConfig({",
        `  schema: "${SCHEMA_PATH}",`,
        `  out: "${tempOut}",`,
        `  dialect: "postgresql",`,
        `  dbCredentials: { url: "postgres://unused:unused@localhost/unused" },`,
        "});",
      ].join("\n");
      writeFileSync(tempConfig, configContent, "utf-8");

      const before = new Set(readdirSync(tempOut));

      // "No schema changes" exits 0 with no new files; drift exits 0 but
      // writes a new migration directory — that delta is what we assert on.
      let output: string;
      try {
        output = execFileSync(
          DRIZZLE_KIT_BIN,
          ["generate", "--config", tempConfig, "--name", "parity_probe"],
          { encoding: "utf-8", stdio: "pipe" }
        );
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message: string };
        throw new Error(
          "drizzle-kit generate failed unexpectedly.\n" +
            `stdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`
        );
      }

      const after = readdirSync(tempOut);
      const newEntries = after.filter((d) => !before.has(d));

      if (newEntries.length > 0) {
        throw new Error(
          "Schema is out of sync with the migration history. " +
            `drizzle-kit generate produced ${newEntries.length} new migration(s): ` +
            newEntries.join(", ") +
            "\n\nRun `bun --filter server db:generate` to generate the missing migration, " +
            "then commit both the schema change and the new migration together.\n\n" +
            `drizzle-kit output:\n${output}`
        );
      }

      expect(newEntries).toHaveLength(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);
});
