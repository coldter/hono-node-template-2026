/**
 * Contract test: `caddy adapt` accepts `deploy/Caddyfile.prod` and emits
 * a config wired to the project's `/caddy/ask` permission endpoint
 * (plan A5.8).
 *
 * The test runs the local `caddy` binary in a subprocess and asserts:
 *   - exit code 0
 *   - stdout is valid JSON
 *   - the adapted config references the internal on-demand permission
 *     endpoint at `http://apps-server:3000/caddy/ask`
 *
 * If `caddy` is not on `PATH`, the entire describe block is skipped via
 * `describe.skipIf(!caddyOnPath)`. CI environments that need this test
 * must install Caddy (`apt install caddy` or the official tarball) and
 * surface a clear signal when it goes missing.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const NEWLINE_RE = /\r?\n/;

function findCaddyOnPath(): string | null {
  const result = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["caddy"],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    return null;
  }
  const out = result.stdout.split(NEWLINE_RE)[0]?.trim();
  return out && out.length > 0 ? out : null;
}

const CADDY_PATH = findCaddyOnPath();
const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const CADDYFILE = resolve(REPO_ROOT, "deploy", "Caddyfile.prod");
const PERMISSION_URL = "http://apps-server:3000/caddy/ask";

function runCaddyAdapt(): {
  code: number | null;
  stdout: string;
  stderr: string;
} {
  if (!CADDY_PATH) {
    throw new Error("caddy binary not found on PATH");
  }
  const result = spawnSync(
    CADDY_PATH,
    ["adapt", "--config", CADDYFILE, "--adapter", "caddyfile"],
    { encoding: "utf8" }
  );
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe.skipIf(!CADDY_PATH)("Caddyfile.prod contract", () => {
  it("`caddy adapt` succeeds and emits the /caddy/ask permission endpoint", () => {
    const { code, stdout, stderr } = runCaddyAdapt();
    expect(code, `caddy adapt stderr:\n${stderr}`).toBe(0);

    const parsed = JSON.parse(stdout) as unknown;
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBeNull();

    // Assert via raw JSON text to avoid coupling to Caddy's app/module shape (drifts between minor versions).
    expect(stdout).toContain(PERMISSION_URL);
  });
});
