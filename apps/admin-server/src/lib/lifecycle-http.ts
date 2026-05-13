/**
 * Generic mapper from lifecycle-domain error codes to HTTP responses.
 *
 * Lifecycle modules (`@repo/tenant-operations`, `enroll/lifecycle.ts`)
 * raise typed errors with a closed `code` union; route handlers translate
 * those into HTTP via a per-module mapping table. The translation pattern
 * is identical every time — exhaustiveness over the closed union, fallback
 * to re-throw for non-lifecycle errors — so it lives here as data + a
 * single helper.
 *
 * Each route module passes:
 *   1. The lifecycle error class (for `instanceof` discrimination).
 *   2. A `Record<TCode, { status, message? }>` mapping its closed code
 *      union to HTTP. TypeScript enforces exhaustiveness: omit a code and
 *      the record literal fails to type-check.
 */

import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Minimal structural contract for the lifecycle error classes — they all
 * extend `Error` and expose a `code` field of their closed union. The
 * concrete class is supplied as the `errorClass` so `instanceof` narrowing
 * still works on the caller side.
 */
export interface LifecycleErrorLike<TCode extends string> extends Error {
  readonly code: TCode;
}

export type LifecycleHttpMapping = Readonly<{
  status: ContentfulStatusCode;
  /**
   * Optional override for the response message. Defaults to the lifecycle
   * error's own `.message`. Use when the wire-side message must not leak
   * the lifecycle's internal phrasing (e.g. `invalid_token` -> a generic
   * 404 message that doesn't distinguish wrong-token from missing-row).
   */
  message?: string;
  /**
   * Optional override for the `cause.code` shown to the central error
   * handler. Defaults to the lifecycle error's `code` upper-cased.
   */
  causeCode?: string;
}>;

/**
 * Type guard signature each lifecycle module supplies. A simple
 * `(err: unknown): err is LifecycleErrorLike<TCode>` plays the role the
 * generic constructor reference would otherwise carry, without dragging
 * the concrete class's closed-union constructor parameter into the
 * lifecycle-http type machinery (where it would fight TS bivariance).
 *
 * The guard is one line at every call site:
 *   `(err): err is OrganizationLifecycleError =>
 *      err instanceof OrganizationLifecycleError`
 */
export type LifecycleErrorGuard<TCode extends string> = (
  err: unknown
) => err is LifecycleErrorLike<TCode>;

/**
 * Build a `(err) => never` thrower that converts a lifecycle error into
 * the canonical `HTTPException` shape, or re-throws when the error is not
 * a lifecycle error.
 *
 * The exhaustive switch over the closed code union is replaced by a
 * `Record<TCode, …>` lookup: missing codes are a compile error at the
 * call site, and a new code added to the lifecycle union forces every
 * consumer to update its table or stop compiling.
 */
export function lifecycleToHttp<TCode extends string>(
  isLifecycleError: LifecycleErrorGuard<TCode>,
  codeMap: Readonly<Record<TCode, LifecycleHttpMapping>>
): (err: unknown) => never {
  return (err: unknown): never => {
    if (isLifecycleError(err)) {
      const mapping = codeMap[err.code];
      throw new HTTPException(mapping.status, {
        message: mapping.message ?? err.message,
        cause: { code: mapping.causeCode ?? err.code.toUpperCase() },
      });
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error("unknown lifecycle error");
  };
}
