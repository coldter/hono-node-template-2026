/**
 * Typed factory for a silent winston `Logger` test stub.
 *
 * Test code repeatedly needs a `Logger` to pass into producers like
 * `runProvisionUserGate` / `createAuth`. The full winston surface is
 * huge — only the four leveled methods (`info`, `warn`, `error`,
 * `debug`) are touched in practice. The boundary cast lives ONCE,
 * here, so test sites are assertion-free.
 */

import type { Logger } from "winston";

type LeveledMethod = (...args: readonly unknown[]) => unknown;

export type SilentLoggerOverrides = Readonly<{
  info?: LeveledMethod;
  warn?: LeveledMethod;
  error?: LeveledMethod;
  debug?: LeveledMethod;
}>;

/**
 * Returns a winston-shaped logger whose four leveled methods are no-ops
 * by default. Any subset can be overridden — typically the test installs
 * a `vi.fn()` spy for the level it wants to assert against.
 */
export function makeSilentLogger(
  overrides: SilentLoggerOverrides = {}
): Logger {
  const stub = {
    info: overrides.info ?? (() => undefined),
    warn: overrides.warn ?? (() => undefined),
    error: overrides.error ?? (() => undefined),
    debug: overrides.debug ?? (() => undefined),
  };
  // boundary: vendor-SDK generic variance — winston's `Logger` carries a
  // large surface (streams, transports, child loggers) that production code
  // never touches in these tests. The single cast here keeps callers
  // assertion-free.
  return stub as unknown as Logger;
}
