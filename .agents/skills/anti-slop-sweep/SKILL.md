---
name: anti-slop-sweep
description: Run a temporary anti-slop (Oxlint) compliance sweep in a Biome-based repository, fix every finding with subagents, verify with an independent behavior audit, then remove all tooling. Use when asked to apply dmmulroy/anti-slop rules, sweep slop patterns, enforce anti-slop style, or remove temporary anti-slop tooling.
---

# Anti-slop sweep

`dmmulroy/anti-slop` is an Oxlint JS/ESTree plugin ruleset. Biome only runs GritQL plugins, so the
rules cannot execute inside a Biome project. The proven approach is to vendor anti-slop, run Oxlint
temporarily, sweep findings with parallel subagents, verify, and uninstall cleanly.

Reference numbers from a full application on this repo: **1,304 diagnostics**, of which 987 were
`require-readable-spacing` (stylistic, skipped by user choice) and **315 substantive anti-slop
findings across 93 files** were fixed.

## 0. Preflight: is anti-slop already bundled?

Some toolchains ship a prebuilt anti-slop plugin, so no clone or dependency install is needed.
Ultracite (v7.11+) exposes `ultracite/oxlint/anti-slop` with a self-contained `plugin.mjs`, and its
`node_modules` does **not** include the Oxlint binary — run it with `bunx oxlint@<version> -c <config>`.
Check `node_modules/ultracite/config/oxlint/anti-slop/index.mjs` (or the equivalent in the repo's
toolchain) before vendoring. Caveats:

- The bundled preset enables **15 rules** and sets `no-runtime-typeof` to
  `{ allowInTypeGuards: true }`, which is more permissive than upstream defaults.
- It omits `no-array-filter-map`, `no-reduce-accumulator-copy`, and `require-readable-spacing`.
- Full upstream parity still requires the vendoring steps below.

The bundled preset is a good fit when the missing rules are out of scope; otherwise vendor upstream.

## 1. Scope first

Always ask the user about `require-readable-spacing`. It is a blanket blank-line policy (199 files,
944 findings here), autofixable, and it competes with the repo formatter. Options: apply repo-wide,
skip, or apply only to files that already change. Record the decision.

## 2. Baseline scan

```bash
git status --porcelain                      # must be clean; record the state
rm -rf /tmp/anti-slop
git clone --depth 1 https://github.com/dmmulroy/anti-slop /tmp/anti-slop
git -C /tmp/anti-slop rev-parse HEAD > /tmp/anti-slop-revision.txt   # recorded provenance
jq '.dependencies["@oxlint/plugins"], .devDependencies.oxlint' /tmp/anti-slop/package.json
sha256sum package.json bun.lock > /tmp/anti-slop-snapshots.txt
```

Pin **exactly** the Oxlint and `@oxlint/plugins` versions anti-slop requires, and vendor its `src/`
(contents land directly under `tools/oxlint/anti-slop/`):

```bash
bun add -D -E oxlint@<version> @oxlint/plugins@<version>
mkdir -p tools/oxlint && cp -r /tmp/anti-slop/src tools/oxlint/anti-slop
```

`.oxlintrc.json` — full rule set including the spacing rule; delete the spacing entry if the user
skipped it (see the substantive config below). Ignore the vendored plugin plus everything the repo's
Biome config ignores:

```json
{
  "ignorePatterns": [
    "tools/oxlint/anti-slop/**",
    ".agents/**", ".claude/**",
    "**/.next/**", "**/dist/**", "**/.turbo/**", "**/.wrangler/**",
    "**/api.gen/**", "**/routeTree.gen.ts", "**/worker-configuration.d.ts"
  ],
  "jsPlugins": [{ "name": "anti-slop", "specifier": "./tools/oxlint/anti-slop/index.ts" }],
  "rules": {
    "oxc/no-accumulating-spread": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error"
  }
}
```

This file is the full config. **Always** derive the substantive acceptance config (used by every fix
agent and the final check):

```bash
jq 'del(.rules["anti-slop/require-readable-spacing"])' .oxlintrc.json > .oxlintrc.substantive.json
```

**Biome interaction:** Oxlint's `ignorePatterns` has no effect on Biome. Do not run repo-wide
`bun run check` while the vendored plugin is in the tree — Biome lints it and reports hundreds of
errors in read-only code. Either run scoped `bunx biome check --write <changed files>` during the
fix pass and reserve the repo-wide check for after cleanup, or temporarily add `"!tools/oxlint/**"`
to `biome.json`'s `files.includes` and restore it in the cleanup step.

Scan and summarize. Separate anti-slop/oxc findings from unrelated diagnostics (oxlint's default
`correctness` rules stay enabled and can emit `unicorn(...)`/`eslint(...)` noise):

```bash
bunx oxlint -c .oxlintrc.json --format json . > /tmp/slop-scan.json
python3 - <<'EOF'
import json, collections
by_rule, by_file = collections.Counter(), collections.defaultdict(collections.Counter)
for d in json.load(open('/tmp/slop-scan.json'))['diagnostics']:
    code = d['code']
    plugin, rule = code.rstrip(')').split('(', 1)
    key = f'{plugin}/{rule}'
    if not (key.startswith('anti-slop/') or key == 'oxc/no-accumulating-spread'):
        print('unrelated, ignored:', code, d['filename'])
        continue
    by_rule[key] += 1; by_file[d['filename']][key] += 1
print(sum(by_rule.values()), 'findings in', len(by_file), 'files')
for r, n in by_rule.most_common(): print(f'{n:5} {r}')
EOF
```

Keep `/tmp/slop-scan.json` — it is the authoritative findings list for the whole sweep.

## 3. Parallel fix pass

First identify **cross-cutting changes** and land them before or alongside the fan-out, because
"one agent per file" cannot express them: shared barrels, import-graph changes (e.g. a root package
barrel that must stop loading a Node-only driver), config/type plumbing. Assign each cross-cutting
change a single owner and tell dependent agents its final shape. Example from the reference sweep:
`packages/db/src/index.ts` stopped runtime-exporting the client, `apps/server/src/middlewares/db.ts`
lazy-imported `@repo/db/client`, and the server/auth/workflow call sites moved in the same pass.

Then split the remaining files into disjoint workstreams by package/directory so no two agents edit
the same file. One agent per area, all reading the vendored rule sources under
`tools/oxlint/anti-slop/rules/` and `tools/oxlint/anti-slop/shared/` first. Each agent gets:

- the exact file list and its findings slice from `/tmp/slop-scan.json`;
- guardrails: preserve runtime behavior, no lint suppressions, no new comments except
  `// SAFETY: <specific invariant>`, never `as unknown as X`, prefer deleting assertions over
  commenting them;
- acceptance: scoped `oxlint -c .oxlintrc.substantive.json <files>` shows 0 findings, scoped
  `bunx biome check --write <files>` clean, workspace typecheck, focused tests.

Escalation rule: a finding is either (a) a real defect — fix it; (b) a rule false positive or a fix
that would weaken tests/behavior — leave the code, document the deviation with evidence, and report
it; never add a suppression or a cosmetic alias to make the rule pass. Rules that need restructuring
rather than substitution are covered in `references/rule-catalog.md`; the highest-effort ones are
`no-module-mocking` (real seams, sometimes a driver-free import graph) and `no-runtime-typeof`
(boundary parsing). Centralize test-fixture assertions in one documented helper instead of
scattering casts.

## 4. Verify, don't trust

```bash
FILES=$( { git diff --name-only --diff-filter=ACMR HEAD; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | grep -v 'api.gen\|routeTree.gen\|worker-configuration' )
test -n "$FILES" || { echo "no changed TypeScript files found"; exit 1; }
bunx oxlint -c .oxlintrc.substantive.json --format default $FILES   # 0 findings
bunx biome check $FILES                                            # scoped while plugin is vendored
bun run check-types
bun run test
```

Run repo-wide `bun run check` only after cleanup (step 5). Then spawn an **independent audit agent**
that reviews the full `git diff` for behavior regressions: reordered conditions, changed defaults,
parsers that accept/reject differently, error classification, redaction bypasses, weakened tests,
relocated anti-patterns, and public API changes. Have it write throwaway old-vs-new probes under
`/tmp` for pure functions. Fix every real finding it reports, then re-run the verification above.

Audit traps found in the reference sweep:

- a redaction walker that returns the raw value when schema parsing fails (fail **closed** instead);
- `data.map(formatter)` rewritten to `data.map((item) => formatter(item))` (drops index/array args);
- dropping a `typeof x === "string"` guard that prevented `undefined === undefined` matches;
- a unique-violation check keyed on a localized `severity` string instead of `instanceof Error` + code;
- a "Raw JSON" debug panel that started printing decoded tagged values;
- tests that keep passing because the seam bypasses the real composition.

## 5. Cleanup

```bash
rm -rf tools/oxlint .oxlintrc.json .oxlintrc.substantive.json
bun remove oxlint @oxlint/plugins
git checkout -- package.json bun.lock        # only if these were unmodified before the sweep
sha256sum -c /tmp/anti-slop-snapshots.txt
bun run check                                # repo-wide Biome, now that the vendored plugin is gone
```

If `biome.json` was temporarily edited, restore it with `git checkout -- biome.json`. Never leave the
dependency changes in place when the user asked for a one-shot sweep. If the user wants ongoing
enforcement, the options are a kept vendored Oxlint config in CI or hand-porting a subset to Biome
GritQL plugins (scope analysis is not available there).

## References

- Load `references/rule-catalog.md` when fixing findings or deciding a deviation.
- Load `references/findings-appendix.md` only when resuming this original sweep or validating its
  317-findings/95-files figures; the paths and counts are historical.
