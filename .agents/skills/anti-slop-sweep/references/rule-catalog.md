# Anti-slop rule playbook

Rule sources live in the vendored anti-slop plugin: `tools/oxlint/anti-slop/rules/*.ts` and
`tools/oxlint/anti-slop/shared/*.ts` (or `src/rules` in an upstream checkout). Read the
implementation before fixing anything. The rules use Oxlint's ESTree + lexical-scope APIs, not a
TypeScript checker, so enforcement is intentionally local.

## `no-array-filter-map`

- **Intent:** adjacent eager `filter().map()` / `map().filter()` allocate twice.
- **Accepted:** lazy iterator pipelines (`values().filter().map().toArray()`), a single `flatMap`,
  or a reducer that pushes into a fresh local array.
- **Trap:** the rule recognizes array evidence from literals, annotations, and immutable local
  aliases only; unknown receivers and imported factories are out of scope. There is no autofix.

## `no-reduce-accumulator-copy` (+ native `oxc/no-accumulating-spread`)

- **Intent:** reducers must mutate a locally owned accumulator instead of copying it each pass.
- **Accepted:** `acc.push(item); return acc;`, `Object.assign(acc, item)`.
- **Traps:** copy methods (`concat`, `slice`, `toSpliced`, `toSorted`, `toReversed`, `with`) need
  local array evidence for the initial value; named callbacks and nested helpers are out of scope.
  No autofix: accumulator ownership cannot be proven syntactically.

## `no-chained-type-assertions`

- **Intent:** nested `as` fabricates evidence (`input as object as User`). Only `as const` chains stay.
- **Fix:** remove the outer assertion by narrowing or parsing at the boundary; if a single
  assertion is truly needed, keep one with a `SAFETY:` comment.
- **Trap:** `as unknown as X` is banned twice over (chain + widening). Replace test fixtures with
  named helper factories that perform one documented assertion.

## `no-conditional-empty-object-spread`

- **Intent:** `...(cond ? { x } : {})` hides omission semantics and has no autofix because
  omission is not the same as assigning `undefined`.
- **Fix:** build the object then assign the optional property conditionally, or branch explicitly.
  Examples from the sweep:

```ts
// before
const options = { ...base, ...(fn ? { sendInvitationEmail: fn } : {}) };
// after
const options = { ...base } satisfies OrganizationOptions;
if (fn) return organization({ ...options, sendInvitationEmail: fn });
return organization(options);
```

## `no-known-value-widening`

- **Intent:** annotating a known literal/object as a broad `Record`/`unknown`/`object` discards keys.
- **Fix:** keep inference and use `satisfies Record<K, V>`; map runtime values to typed records via
  exhaustive key types (`satisfies Record<KnownEventKey, BadgeStyle>`) so drift fails the build.
- **Signals:** `Record<number, string>` lookup tables → prefer a `Map` or a `switch`. Passing an
  already-typed value to a local `unknown` type predicate is also rejected.

## `no-module-mocking` (highest effort)

- **Intent:** no `vi.mock` / `vi.doMock` / `vi.unstable_mockModule`; tests need real seams.
- **Accepted seams observed in the sweep:**
  - factory injection: `createEmailSender(createClient)` with a default `sendEmail` composed from
    `new Resend(apiKey)`; per-key caching lives in the factory closure.
  - `vi.spyOn(realObject, "method")` instead of mocking the module (`sonner` toast, `authClient`).
  - inject hooks/routes/objects as parameters (`useServerTable({ route, useData })`).
  - component tests use the real router with a memory history instead of a global hook mock.
- **Import-graph seams for worker tests:** if importing the app pulls Node-only CJS (`pg`), make the
  app graph driver-free — keep client values out of the root barrel (`export type` only) and
  lazily `await import("@repo/db/client")` inside the middleware that needs it. Verify with a probe
  that importing the app loads zero `pg` modules.
- **Traps:** do not replace mocks with vacuous tests. Assertions must still exercise real code paths.
  Check that a seam does not make tests pass when the production wiring is broken.

## `no-object-parameters` / `no-reduce-accumulator-copy` / `no-reflect-*` / `no-shape-in-symbol-names` / `no-widen-then-assert`

Zero findings in the reference sweep, but the fixes are mechanical:

- `object` inputs → name the concrete shape or accept a generic.
- `Reflect.apply(fn, owner, args)` → `fn.apply(owner, args)` or a direct typed call.
  `Reflect.get(owner, key)` → typed property access or a boundary parse.
- Local identifiers containing `shape` → rename (`UserShape` → `User`). Static member reads such
  as Zod's `schema.shape` are allowed because they cannot be renamed locally.
- Widen-then-assert → keep the narrow type from the start; assertions should not resurrect evidence
  the code already had.

## `no-runtime-typeof`

- **Intent:** ad-hoc `typeof` narrowing of unparsed values means the boundary was not parsed.
- **Allowed:** existence probes (`typeof document === "undefined"`).
- **Fix playbook:**
  - parse the boundary with Zod and branch on the parsed value;
  - for `Record` walks, express the domain as a recursive union + schema and fail closed;
  - for "is this callable" checks, prefer a typed helper (`isFunction`) over `typeof`;
  - a type predicate may declare `value: unknown` (rule exception) but its body still cannot use
    `typeof` unless the rule's `allowInTypeGuards` option is explicitly enabled.
- **Traps:**
  - a redaction/walk utility must fail closed: if a nested value cannot be parsed, return the
    redaction marker, never the raw value;
  - schema parsing that recursively validates a subtree can reject a whole parent when one exotic
    child fails — decide fail-open vs fail-closed deliberately and test it;
  - `instanceof` is not a drop-in for `typeof`: it fails for cross-realm functions and callables
    without `Function.prototype`. Document the same-realm assumption when used.
  - a `typeof` equality guard (`typeof x === "string" && x === y`) can be preserved exactly with a
    coercion identity (`x === String(x) && x === y`) when a schema dependency is undesirable.

## `no-unknown-parameters` / `no-unknown-returns` / `no-unknown-type-aliases`

- **Intent:** explicit `unknown` in contracts defers the real type to every caller.
- **Exceptions:** the narrowed subject of a type predicate; `cause` on error handling.
- **Fix playbook:**
  - replace `unknown` params with the boundary type or a generic (`TResource`);
  - rename catch/error params to `cause` only when the value genuinely is an error cause;
  - derive return types instead of annotating `unknown` (`Promise<unknown[]>` → the real row type);
  - `no-unknown-type-aliases` catches aliases that resolve to `unknown`, including generic ones.
- **Trap:** renaming `unknown` to a named alias that still resolves to `unknown`
  (`MessageBatch["messages"][number]["body"]`) satisfies the rule but adds no evidence. Keep it only
  if the alias names the real framework boundary and document that the parser inside is the guard.

## `no-unsafe-dictionary-type`

- **Intent:** dictionaries whose values are `unknown`/`any`/`object`/`{}` provide no contract.
- **Accepted:** generic constraints (`T extends Record<string, unknown>`); concrete value unions
  (`Record<string, string>`, recursive JSON unions).
- **Fix playbook:** derive from the owning schema (`NotificationProps = NonNullable<Notification["props"]>`),
  split open metadata into explicit change-set/open unions, or use `Map` for runtime registries.
- **Trap:** watch permissive union arms: an all-optional interface member can make
  `Record<string, unknown>` assignable to the new "safe" type, so the hardening is cosmetic.

## `require-safety-comment-for-type-assertion`

- **Intent:** every non-`const` assertion needs a nearby `// SAFETY: <specific invariant>` comment.
- **Playbook:** delete unnecessary assertions first. For the survivors, state the concrete invariant
  (write-side contract, runtime shape, framework guarantee), never "needed for types".
- **Traps:** avoid comments that describe external callers rather than local invariants; they rot.
  Comments immediately above exported declarations are recognized.

## `require-readable-spacing`

- **Intent:** ESLint Stylistic padding rules vendored as an autofixable Oxlint rule (blank lines
  between declarations, around multiline bindings, before control flow).
- **Decision point:** this is stylistic and dominated findings (944/1,262 in the reference sweep).
  Ask the user before applying; run it as a separate `--fix` pass after substantive fixes, then the
  formatter. Skipping it is a valid, user-approved deviation.
