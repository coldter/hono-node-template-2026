/**
 * Shared framing for lifecycle state-machine errors.
 *
 * Three lifecycle writers (organization, enrollment, custom-hostname)
 * share the same `code` + `Error` shape but emit disjoint code unions and
 * are distinguished at the HTTP boundary by `instanceof` checks against
 * the per-module subclass. Hence: generic base + per-module `extends`
 * subclasses, not a single shared class.
 */

export class LifecycleError<TCode extends string> extends Error {
  readonly code: TCode;

  constructor(code: TCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}
