/**
 * Shared transition-table contract for lifecycle state machines.
 *
 * Each lifecycle writer declares a `TRANSITIONS` table of allowed arrows
 * and calls `assertArrow(TRANSITIONS, from, to, ErrorClass)` before
 * applying any non-noop transition. The thrown error is the per-module
 * subclass of `LifecycleError` because the three writers (organization,
 * enrollment, custom-hostname) want their own subclasses for `instanceof`
 * checks at HTTP boundaries.
 *
 * Deliberately NOT extracted: the per-arrow body. The three writers
 * differ substantially (BA-session cascade, audit-row count, tombstone
 * writes, reconciler bookkeeping); a generic `applyTransition` engine
 * would over-couple the inner branches.
 */

import type { LifecycleError } from "./lifecycle-error";

export type TransitionTable<TState extends string> = Readonly<
  Record<TState, ReadonlySet<TState>>
>;

/**
 * Class constructor accepting `("invalid_transition", message)`. The
 * caller passes their per-module subclass so the thrown error is
 * `instanceof OrganizationLifecycleError` etc.
 */
export type InvalidTransitionErrorCtor = new (
  code: "invalid_transition",
  message: string
) => LifecycleError<string>;

/**
 * Throw an `instanceof ErrorCtor` (always a `LifecycleError` subclass) if
 * `from → to` is not in `table`.
 */
export function assertArrow<TState extends string>(
  table: TransitionTable<TState>,
  from: TState,
  to: TState,
  ErrorCtor: InvalidTransitionErrorCtor
): void {
  if (!table[from].has(to)) {
    throw new ErrorCtor(
      "invalid_transition",
      `Cannot transition from ${from} to ${to}`
    );
  }
}
