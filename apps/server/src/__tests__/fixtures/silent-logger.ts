// Winston `Logger` test stub. The boundary cast lives once here so test sites are assertion-free.
import type { Logger } from "winston";

type LeveledMethod = (...args: readonly unknown[]) => unknown;

export type SilentLoggerOverrides = Readonly<{
  info?: LeveledMethod;
  warn?: LeveledMethod;
  error?: LeveledMethod;
  debug?: LeveledMethod;
}>;

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
