/**
 * Structural test for the `liveOrganizations` read seam.
 *
 * Walks the apps + packages tree and asserts every direct read of the
 * `organizations` table either uses the helper or is in the ALLOWLIST.
 * Bypassing the helper is a tenancy invariant carve-out; every entry must
 * document why it's justified.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../");

type AllowlistEntry = Readonly<{
  reason: string;
  addedInPhase: string;
}>;

const ALLOWLIST: Readonly<Record<string, AllowlistEntry>> = {
  "packages/db/src/live-organizations.ts": {
    reason:
      "The seam itself. This file IS the allowlist exception — every other read goes through its exported builder.",
    addedInPhase: "A2",
  },
};

const FROM_ORG_RE = /\bfrom\s*\(\s*organizations\s*\)/;
const QUERY_ORG_RE = /\bquery\s*\.\s*organizations\s*\.\s*find(First|Many)\b/;
const TS_FILE_RE = /\.(tsx|ts)$/;

function* walkSourceFiles(rootDir: string): Generator<string> {
  const stack = [rootDir];
  const ignored = new Set([
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".turbo",
    ".next",
  ]);
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") {
        continue;
      }
      if (ignored.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && TS_FILE_RE.test(entry.name)) {
        yield path.relative(REPO_ROOT, full);
      }
    }
  }
}

describe("liveOrganizations read-seam invariant", () => {
  it("flags any direct organizations read outside the allowlist", () => {
    const roots = ["apps", "packages"]
      .map((d) => path.join(REPO_ROOT, d))
      .filter((d) => fs.existsSync(d));
    const offenders: { file: string; line: number; match: string }[] = [];
    for (const root of roots) {
      for (const file of walkSourceFiles(root)) {
        if (file in ALLOWLIST) {
          continue;
        }
        const abs = path.join(REPO_ROOT, file);
        let content: string;
        try {
          content = fs.readFileSync(abs, "utf-8");
        } catch {
          continue;
        }
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i] ?? "";
          if (FROM_ORG_RE.test(line)) {
            offenders.push({ file, line: i + 1, match: line.trim() });
          } else if (QUERY_ORG_RE.test(line)) {
            offenders.push({ file, line: i + 1, match: line.trim() });
          }
        }
      }
    }
    if (offenders.length > 0) {
      const detail = offenders
        .map((o) => `  ${o.file}:${o.line}\n    ${o.match}`)
        .join("\n");
      throw new Error(
        `Found ${offenders.length} direct organizations read(s) outside the allowlist. ` +
          "Use `liveOrganizations(executor)` from `@repo/db` instead, or add the file to " +
          "ALLOWLIST in this spec with a justification.\n" +
          detail
      );
    }
    expect(offenders).toHaveLength(0);
  });

  it("allowlist files exist", () => {
    for (const rel of Object.keys(ALLOWLIST)) {
      const abs = path.join(REPO_ROOT, rel);
      expect(fs.existsSync(abs), `Allowlist file not found: ${rel}`).toBe(true);
    }
  });

  it("allowlist entries have justifications", () => {
    const entries = Object.entries(ALLOWLIST);
    expect(entries.length).toBeGreaterThan(0);
    for (const [file, entry] of entries) {
      expect(
        entry.reason.trim().length,
        `Missing reason for ${file}`
      ).toBeGreaterThan(0);
      expect(
        entry.addedInPhase.trim().length,
        `Missing addedInPhase for ${file}`
      ).toBeGreaterThan(0);
    }
  });
});
