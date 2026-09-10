#!/usr/bin/env bun

import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

declare const prompt: (message: string, defaultValue?: string) => string | null;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

const APP_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PACKAGE_SCOPE_PATTERN = /^@[a-z0-9][a-z0-9-]*$/;
const EMAIL_PATTERN = /.+@.+\..+/;
const SCOPE_PATTERN = /@repo\//g;
const ROOT_NAME_PATTERN = /"name"\s*:\s*"repo"/g;
const QUOTE_OR_SPACE_PATTERN = /\s|"/;
const QUOTE_PATTERN = /"/g;
const README_HEADING_PATTERN = /^#\s+.*$/m;

type Answers = {
  appName: string;
  packageScope: string;
  companyName: string;
  supportEmail: string;
};

const SCAN_DIRS = ["apps", "packages"];
const FILE_EXTENSIONS = new Set([".ts", ".tsx", ".json"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".turbo",
  ".next",
  "dist",
  "build",
  ".git",
  "coverage",
  ".cache",
  "api.gen",
]);

function ask(
  message: string,
  validator?: (v: string) => string | undefined
): string {
  while (true) {
    const raw = prompt(message);
    const answer = (raw ?? "").trim();
    const error = validator?.(answer);
    if (error) {
      console.error(`  ${error}`);
      continue;
    }
    return answer;
  }
}

function validateAppName(value: string): string | undefined {
  if (!value) {
    return "App name is required.";
  }
  if (!APP_NAME_PATTERN.test(value)) {
    return "App name must be lowercase letters, numbers, and dashes only.";
  }
}

function validatePackageScope(value: string): string | undefined {
  if (!value) {
    return "Package scope is required.";
  }
  if (!PACKAGE_SCOPE_PATTERN.test(value)) {
    return "Package scope must start with '@' followed by lowercase letters, numbers, and dashes.";
  }
}

function validateEmail(value: string): string | undefined {
  if (!value) {
    return "Email is required.";
  }
  if (!EMAIL_PATTERN.test(value)) {
    return "Invalid email address.";
  }
}

function gatherAnswers(): Answers {
  console.info("Template initializer");
  console.info("--------------------");
  const appName = ask("App name (lowercase, e.g. my-app): ", validateAppName);
  const packageScope = ask(
    "Package scope (e.g. @my-app): ",
    validatePackageScope
  );
  const companyName = ask("Company name (e.g. Acme Inc.): ", (v) =>
    v ? undefined : "Company name is required."
  );
  const supportEmail = ask(
    "Support email (e.g. support@example.com): ",
    validateEmail
  );
  return { appName, companyName, packageScope, supportEmail };
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          return [];
        }
        return walk(full);
      }
      if (entry.isFile()) {
        return [full];
      }
      return [];
    })
  );
  return files.flat();
}

function walkWithExtensions(dir: string): Promise<string[]> {
  return walk(dir).then((files) =>
    files.filter((file) =>
      FILE_EXTENSIONS.has(file.slice(file.lastIndexOf(".")))
    )
  );
}

async function collectTargetFiles(): Promise<string[]> {
  const existingDirs = (
    await Promise.all(
      SCAN_DIRS.map(async (dir) => {
        const abs = join(ROOT, dir);
        try {
          await stat(abs);
          return abs;
        } catch {
          return null;
        }
      })
    )
  ).filter((dir): dir is string => dir !== null);
  const nestedFiles = await Promise.all(existingDirs.map(walkWithExtensions));

  return [nestedFiles.flat(), join(ROOT, "package.json")].flat();
}

async function rewriteFile(
  file: string,
  transform: (content: string) => string
): Promise<boolean> {
  const original = await readFile(file, "utf8");
  const updated = transform(original);
  if (updated === original) {
    return false;
  }
  if (DRY_RUN) {
    console.info(`  would update ${relative(ROOT, file)}`);
  } else {
    await writeFile(file, updated, "utf8");
    console.info(`  updated ${relative(ROOT, file)}`);
  }
  return true;
}

function makeReplacer(answers: Answers) {
  return (content: string, file: string): string => {
    let next = content.replace(SCOPE_PATTERN, `${answers.packageScope}/`);
    if (file === join(ROOT, "package.json")) {
      next = next.replace(ROOT_NAME_PATTERN, `"name": "${answers.appName}"`);
    }
    return next;
  };
}

async function updateEnvExample(path: string, answers: Answers): Promise<void> {
  try {
    await stat(path);
  } catch {
    return;
  }

  await rewriteFile(path, (content) => {
    let next = content;
    next = setEnvVar(next, "APP_NAME", answers.appName);
    next = setEnvVar(next, "COMPANY_NAME", answers.companyName);
    next = setEnvVar(next, "SUPPORT_EMAIL", answers.supportEmail);
    next = setEnvVar(next, "VITE_APP_NAME", answers.appName);
    next = setEnvVar(next, "VITE_COMPANY_NAME", answers.companyName);
    next = setEnvVar(next, "VITE_SUPPORT_EMAIL", answers.supportEmail);
    next = setEnvVar(next, "EMAIL_FROM_NAME", answers.appName);
    return next;
  });
}

function setEnvVar(content: string, key: string, value: string): string {
  const pattern = new RegExp(`^(\\s*)${key}=.*$`, "gm");
  if (!pattern.test(content)) {
    return content;
  }
  pattern.lastIndex = 0;
  return content.replace(pattern, (_match, indent: string) => {
    const needsQuotes = QUOTE_OR_SPACE_PATTERN.test(value);
    const safe = needsQuotes
      ? `"${value.replace(QUOTE_PATTERN, '\\"')}"`
      : value;
    return `${indent}${key}=${safe}`;
  });
}

async function updateReadme(answers: Answers): Promise<void> {
  const readmePath = join(ROOT, "README.md");
  try {
    await stat(readmePath);
  } catch {
    return;
  }
  await rewriteFile(readmePath, (content) =>
    content.replace(README_HEADING_PATTERN, `# ${answers.appName}`)
  );
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function removeSelf(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const pkgPath = join(ROOT, "package.json");
  if (DRY_RUN) {
    console.info(`  would delete ${relative(ROOT, self)}`);
    console.info(`  would remove "template:init" script from package.json`);
    return;
  }
  const pkgRaw = await readFile(pkgPath, "utf8");
  const pkg: PackageJson = JSON.parse(pkgRaw);
  if (pkg.scripts && "template:init" in pkg.scripts) {
    const { "template:init": _removed, ...rest } = pkg.scripts;
    pkg.scripts = rest;
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    console.info("  removed template:init script from package.json");
  }
  await unlink(self);
  console.info(`  deleted ${relative(ROOT, self)}`);
}

async function main(): Promise<void> {
  const answers = gatherAnswers();
  console.info("");
  console.info(
    DRY_RUN ? "Dry run -- no files will be written." : "Applying changes..."
  );

  const files = await collectTargetFiles();
  const replace = makeReplacer(answers);
  const results = await Promise.all(
    files.map((file) => rewriteFile(file, (content) => replace(content, file)))
  );
  const touched = results.filter(Boolean).length;
  console.info(`Rewrote scope/name in ${touched} files.`);

  console.info("Updating env examples...");
  await updateEnvExample(join(ROOT, "apps/server/.env.example"), answers);
  await updateEnvExample(join(ROOT, "apps/web/.env.example"), answers);
  await updateEnvExample(join(ROOT, ".env.production.example"), answers);

  console.info("Updating README...");
  await updateReadme(answers);

  console.info("Cleaning up template scaffolding...");
  await removeSelf();

  console.info("");
  console.info("Done. Next steps:");
  console.info("  1. cp apps/server/.env.example apps/server/.env");
  console.info("  2. openssl rand -hex 32  # use as BETTER_AUTH_SECRET");
  console.info("  3. bun install && bun run db:push && bun run db:seed");
}

main().catch((error) => {
  console.error("Template init failed:", error);
  process.exit(1);
});
