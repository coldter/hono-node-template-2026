/**
 * Shared test fixture: silent winston Logger.
 *
 * The auth module's internal helpers accept `Logger` so a no-op stub keeps
 * tests quiet without standing up the real winston transport stack. The
 * structural surface that production code reads is `info | warn | error |
 * debug`; the boundary cast below concentrates the type widening in one
 * place rather than spreading it across every test file.
 */

import { vi } from "vitest";
import type { Logger } from "winston";

type SilentLoggerHandle = {
  logger: Logger;
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

/**
 * Build a silent logger with spies on each method. Each call returns a fresh
 * set of spies so tests can assert on individual log invocations.
 *
 * boundary: test fixture reflection — winston's `Logger` type carries a wide
 * surface (35+ methods, leveled call signatures, transport state) that no
 * structural stub can satisfy. Consumers only read the four leveled writers
 * stubbed here.
 */
export function makeSilentLogger(): SilentLoggerHandle {
  const info = vi.fn();
  const warn = vi.fn();
  const error = vi.fn();
  const debug = vi.fn();
  const logger = { info, warn, error, debug } as unknown as Logger;
  return { logger, info, warn, error, debug };
}

/**
 * Convenience accessor for tests that never inspect log calls.
 *
 * Re-exports a freshly constructed silent logger so the underlying spies are
 * not shared across tests (test isolation matters more than allocator cost).
 */
export function silentLogger(): Logger {
  return makeSilentLogger().logger;
}
