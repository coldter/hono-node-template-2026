// boundary: shared silent winston Logger fixture. Concentrates the cast in
// one place; consumers only read `info | warn | error | debug`.
import { vi } from "vitest";
import type { Logger } from "winston";

type SilentLoggerHandle = {
  logger: Logger;
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

export function makeSilentLogger(): SilentLoggerHandle {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const debug = vi.fn();
  const logger = { info, warn, error, debug } as unknown as Logger;
  return { logger, info, warn, error, debug };
}

/** Fresh silent logger for tests that don't inspect log calls (avoids shared spies). */
export function silentLogger(): Logger {
  return makeSilentLogger().logger;
}
