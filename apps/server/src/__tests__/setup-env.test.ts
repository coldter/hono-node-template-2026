/**
 * Contract test: `scripts/setup-env.ts` seeds `.env` from the canonical
 * Zod env schema, preserves operator edits across re-runs, and marks
 * required-but-no-default keys with a `# REQUIRED` comment.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSetupEnv } from "../../../../scripts/setup-env";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

const NODE_ENV_LINE_RE = /^NODE_ENV=development$/m;
const PORT_LINE_RE = /^PORT=3000$/m;
const APP_WILDCARD_LINE_RE = /^APP_WILDCARD_HOST=app\.localhost$/m;
const BRANDING_HOST_LINE_RE = /^BRANDING_HOST=branding\.localhost$/m;
const DATABASE_URL_EMPTY_RE = /^DATABASE_URL=$/m;
const BETTER_AUTH_SECRET_EMPTY_RE = /^BETTER_AUTH_SECRET=$/m;
const APP_NAME_LINE_RE = /^APP_NAME=.*/m;
const APP_NAME_ANY_RE = /^APP_NAME=/gm;
const APP_NAME_CUSTOM_RE = /^APP_NAME=OperatorCustomised$/m;
const DATABASE_URL_PRESET_RE = /^DATABASE_URL=postgres:\/\/existing$/m;
const MY_CUSTOM_LINE_RE = /^MY_CUSTOM=keep$/m;
const ADDED_BY_MARKER_RE = /^# Added by setup:env on \d{4}-\d{2}-\d{2}$/m;
const DATABASE_URL_ANY_RE = /^DATABASE_URL=/gm;

describe("scripts/setup-env", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "setup-env-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates .env with every schema key on first run", () => {
    const result = runSetupEnv(dir);
    expect(result.outcomes).toEqual([
      { path: join(dir, ".env"), status: "created" },
    ]);

    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toMatch(NODE_ENV_LINE_RE);
    expect(env).toMatch(PORT_LINE_RE);
    expect(env).toMatch(APP_WILDCARD_LINE_RE);
    expect(env).toMatch(BRANDING_HOST_LINE_RE);
    expect(env).toMatch(DATABASE_URL_EMPTY_RE);
    expect(env).toMatch(BETTER_AUTH_SECRET_EMPTY_RE);
  });

  it("marks required-but-no-default keys with a # REQUIRED comment", () => {
    runSetupEnv(dir);
    const env = readFileSync(join(dir, ".env"), "utf8");

    const requiredKeys = ["DATABASE_URL", "CORS_ORIGIN", "BETTER_AUTH_SECRET"];
    for (const key of requiredKeys) {
      // Each key gets its own marker block; substring search avoids per-iteration regex construction.
      expect(env, `expected ${key} to carry a # REQUIRED marker`).toContain(
        `# REQUIRED\n${key}=`
      );
    }
  });

  it("does not duplicate keys or clobber operator edits on the second run", () => {
    runSetupEnv(dir);
    const first = readFileSync(join(dir, ".env"), "utf8");

    const tweaked = first.replace(
      APP_NAME_LINE_RE,
      "APP_NAME=OperatorCustomised"
    );
    writeFileSync(join(dir, ".env"), tweaked, "utf8");

    const second = runSetupEnv(dir);
    expect(second.outcomes[0]?.status).toBe("unchanged");

    const after = readFileSync(join(dir, ".env"), "utf8");
    expect(after).toBe(tweaked);
    expect(after.match(APP_NAME_ANY_RE)).toHaveLength(1);
    expect(after).toMatch(APP_NAME_CUSTOM_RE);
  });

  it("appends missing keys under a dated marker when the file already exists", () => {
    writeFileSync(
      join(dir, ".env"),
      "DATABASE_URL=postgres://existing\nMY_CUSTOM=keep\n",
      "utf8"
    );

    const result = runSetupEnv(dir);
    expect(result.outcomes[0]?.status).toBe("updated");

    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toMatch(DATABASE_URL_PRESET_RE);
    expect(env).toMatch(MY_CUSTOM_LINE_RE);
    expect(env).toMatch(ADDED_BY_MARKER_RE);
    expect(env.match(DATABASE_URL_ANY_RE)).toHaveLength(1);
    expect(env).toMatch(APP_WILDCARD_LINE_RE);
  });

  it("targets apps/admin-server/.env only when the workspace exists", () => {
    const withoutAdmin = runSetupEnv(dir);
    expect(withoutAdmin.outcomes).toHaveLength(1);

    mkdirSync(join(dir, "apps", "admin-server"), { recursive: true });
    const withAdmin = runSetupEnv(dir);
    expect(withAdmin.outcomes).toHaveLength(2);
    expect(withAdmin.outcomes[1]?.path).toBe(
      join(dir, "apps", "admin-server", ".env")
    );
    expect(existsSync(join(dir, "apps", "admin-server", ".env"))).toBe(true);
  });

  it("script entrypoint resolves relative to the repo root", () => {
    // Sanity: the path the script uses by default is the actual repo root.
    expect(
      existsSync(join(REPO_ROOT, "apps", "server", "src", "env-schema.ts"))
    ).toBe(true);
  });
});
