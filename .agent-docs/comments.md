# Code Comments

Code says **what** and **how**. Comments exist for the one thing code cannot express: **why**. Every comment you write or leave in place must earn its line. A redundant comment is noise; a stale or wrong comment is worse than no comment at all.

## The rule

- Default to **no comment**. Make the code self-explanatory with precise names and small functions first.
- Add a comment only to capture something a competent reader could not recover from the code itself.
- If a comment merely restates the code, delete it. If a name needs a comment to be understood, rename instead of commenting.
- Keep comments adjacent to the exact code they describe, and update or delete them the moment that code changes.

## Never write these (and remove them on sight)

- **Restatement / narration** — `// increment count` over `count++`; `// loop over users`; `// return the result`.
- **Name-echo JSDoc** — `/** The user id. */` over `userId`; `/** Format notification for API response. */` over `formatNotification()`; `@param userId The user id`.
- **Banner / divider art** — `// ===== HELPERS =====`, `// --------`, decorative `// #region` separators. If a file needs visual section breaks to be navigable, split the file or extract real modules.
- **Step / Arrange-Act-Assert narration** — `// Step 1: validate`, `// Arrange`, `// Act`. The code already shows the steps.
- **Commented-out code** — delete it. Git remembers.
- **Changelog / attribution / dated notes** — `// added by X`, `// changed 2026-06-09 to fix bug`. Git history owns this.
- **Empty TODOs** — `// TODO: improve later`. A TODO must name what is missing and, ideally, link a ticket; otherwise drop it.
- **Tag-only JSDoc that restates the signature** — `@returns {string} the string`, `@param {number} count count`.

## Write a comment only when it captures

- **Why this approach** over the obvious alternative — a trade-off, a constraint, a deliberate non-obvious choice.
- **Gotchas and footguns** — ordering, timing, concurrency, or re-entrancy hazards; security-sensitive branches; fail-closed behaviour.
- **Invariants and units the type cannot express** — `// seconds, not milliseconds`; `// caller must hold the org lock`; `// must stay in sync with LOCKOUT_CONFIG`.
- **Workarounds for upstream bugs** — and link the issue / PR / CVE.
- **Pointers to a spec, RFC, ticket, or source** when behaviour is driven by an external contract.
- **Intentional surprises** — `// intentionally empty: extension point, see onUserStatusChange contract above`; an empty `catch` is still banned (see [error-handling.md](error-handling.md)).

Keep each one minimal and true. One sharp sentence beats a paragraph.

## Never remove these (functional directives)

These are not prose — they change compiler, linter, bundler, or dead-code-analysis behaviour. Treat them as code. Never delete or weaken one unless you are also removing the code that needs it.

- `// boundary: <reason>` — required to justify an allowed cast; see the casts section of [typescript.md](typescript.md).
- `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`
- `biome-ignore`, `biome-ignore-all`
- knip directives: `@public`, `@internal`, `@alias`
- `@lintignore`
- `eslint-disable` / `oxlint-disable`, `prettier-ignore`
- coverage: `v8 ignore`, `c8 ignore`, `istanbul ignore`

Every suppression must carry (or gain) a short reason. A bare `@ts-expect-error` with no explanation is a defect.

## JSDoc

- Use JSDoc on exported / public API only where it adds real usage information: constraints, side effects, examples, nullability and edge-case semantics.
- Drop `@param` / `@returns` lines that only echo the name or the type. Keep ones that add units, ranges, error conditions, or null semantics.
- Do not duplicate a Zod `.describe()` or OpenAPI `.openapi({ description })` string in a neighbouring comment — that string is already the documentation.

## Style

- No emojis anywhere (repo-wide rule).
- Write comments as complete, plain statements. Terse is good; cute is not.
- Place the comment directly above, or trailing, the line it explains.
- A stale comment is a bug. When you touch code, fix or delete its comments in the same change.

## Litmus test

Apply this to every comment, before writing it and when you encounter one:

> Would a competent engineer be surprised, misled, or slowed down **without** this line?
> If no, delete it. If yes, keep it short and make sure it is true.

### Before

```ts
// ============================================================
// RESPONSE FORMATTERS
// ============================================================

/**
 * Format notification for API response.
 */
export function formatNotification(row: NotificationRow): NotificationResponse {
  // Only push supports read tracking; email and SMS have no read state
  const isRead = row.channel === "push" ? row.readAt !== null : null;
  // Return the formatted object
  return { id: row.id, isRead, readAt: row.readAt };
}
```

### After

```ts
export function formatNotification(row: NotificationRow): NotificationResponse {
  // Only push supports read tracking; email and SMS have no read state.
  const isRead = row.channel === "push" ? row.readAt !== null : null;
  return { id: row.id, isRead, readAt: row.readAt };
}
```

The banner, the name-echo JSDoc, and the return narration are gone. The one comment that survives explains a domain rule the types cannot — exactly what a comment is for.
