# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version
the `server` and `web` packages and cut releases. It does **not** require
Conventional Commits — you describe each change in a small markdown file instead.

Both packages are `private`, so releases produce **git tags + GitHub Releases
only — nothing is published to npm** (see `privatePackages` in `config.json`).

## The flow in three steps

```
  1. add a changeset            2. merge to main                3. merge the Version PR
  ------------------            ----------------                ----------------------
  bunx changeset        ->      release.yml opens a      ->     release.yml runs
  (commit the .md               "Version packages" PR           `changeset tag`:
   file with your PR)           that bumps versions +           git tag + GitHub Release
                                writes CHANGELOG.md             (no npm publish)
```

Changeset files pile up in this folder as PRs merge. The "Version packages" PR
stays open and keeps updating itself until you merge it — that merge is what
actually tags the release.

## Step 1: add a changeset (do this in your feature PR)

```bash
bunx changeset
```

It asks three things and writes a file like `.changeset/silly-otters-jump.md`:

```md
---
"server": minor
"web": patch
---

Add API-key auth and fix a redirect loop on the login page.
```

- **Which packages** changed (`server`, `web`).
- **Bump level** — `patch` (fixes), `minor` (new features), `major` (breaking).
- **Summary** — becomes the CHANGELOG entry. Write it for a reader, not a diff.

Commit that file alongside your code. A PR with no changeset is fine for changes
that need no release (docs, CI tweaks) — for those run `bunx changeset --empty`
or just skip it.

## Step 2: merge to main

`.github/workflows/release.yml` runs `changesets/action`, which collects every
pending changeset and opens a **"Version packages" PR**. For the example above it
would:

- bump `apps/server/package.json` `0.0.0 -> 0.1.0` (minor) and
  `apps/web/package.json` `0.0.0 -> 0.0.1` (patch),
- prepend those summaries to each package's `CHANGELOG.md`,
- delete `.changeset/silly-otters-jump.md`.

If more feature PRs merge before you release, this PR updates itself to include
them.

## Step 3: merge the "Version packages" PR

Merging it triggers `release.yml` once more. With no pending changesets left, it
runs the `publish` step (`bunx changeset tag`), creating tags like
`server@0.1.0` / `web@0.0.1` and the matching GitHub Releases.

## Handy commands

```bash
bunx changeset            # add a changeset
bunx changeset status     # list pending changesets / planned bumps
bunx changeset version    # apply bumps + write changelogs locally (CI normally does this)
bunx changeset tag        # create git tags (CI normally does this)
```

Full docs: https://github.com/changesets/changesets
