/**
 * `commonEntries` is a chain-fragment factory for the entries that both
 * tenant-server and admin-server mount verbatim modulo configuration. The
 * factory returns a freshly-built array of `ChainEntry` records — each app
 * spreads it into its own chain and may interleave or append app-specific
 * entries (tenant resolver, host guard, auth proxy) before/after.
 *
 * Design note: every entry's `requires` defaults to the dependency that
 * exists in BOTH apps (e.g. `globalRateLimit` -> `cors`). App-specific
 * extra `requires` are passed via per-entry deps, NOT mutated after the
 * fact — that keeps the chain-as-data property intact so
 * `assertChainWellFormed` can still catch mis-orderings at boot.
 *
 * Server's chain interleaves the host/tenancy block between the early
 * entries (init/trim/logger) and the late entries (cors/rate-limit/audit),
 * so it cherry-picks via name rather than spreading the full fragment.
 * `commonEntriesByName` exposes that cherry-pick seam without forcing
 * server to duplicate factory wiring.
 */

import type { Env as HonoEnv, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { logger as httpLogger } from "hono/logger";
import { trimTrailingSlash } from "hono/trailing-slash";
import type { ChainEntry } from "./chain";

/**
 * Per-entry configuration. Each field is required because every common
 * entry is always emitted; an app that wants to skip one drops it from
 * the cherry-picked list returned by `commonEntriesByName`.
 */
export type CommonEntryDeps<E extends HonoEnv> = Readonly<{
  /** Pre-built request-context-init middleware (env-typed in caller). */
  requestContextInit: MiddlewareHandler<E>;

  /**
   * Optional log sink. Hono's default logger writes to `console.log`;
   * tenant-server pipes through pino. `undefined` keeps the default.
   */
  httpLoggerSink?: (str: string, ...rest: string[]) => void;

  /**
   * CORS configuration. `origin` is the only field that varies between
   * apps (tenant vs operator allow-list); the rest of the policy is
   * fixed and shared.
   */
  cors: Readonly<{
    origin: readonly string[];
    /** Extra `requires` (e.g. `tenantMiddleware` for tenant-server). */
    extraRequires?: readonly string[];
  }>;

  /** Pre-built rate-limit middleware (each app sets its own limit). */
  globalRateLimit: MiddlewareHandler<E>;

  /** Pre-built audit-context middleware. */
  auditContextMiddleware: MiddlewareHandler<E>;

  /**
   * Override `requires` for `auditContextMiddleware`. Defaults to
   * `["requestContextInit"]` (audit-context only needs the envelope
   * seeded). Tenant-server overrides to `["authContextMiddleware"]` so
   * the chain guarantees principal-aware audit writes downstream.
   */
  auditContextRequires?: readonly string[];
}>;

/** Canonical names of every entry built by `commonEntries`. */
export const COMMON_ENTRY_NAMES = [
  "requestContextInit",
  "trimTrailingSlash",
  "httpLogger",
  "cors",
  "globalRateLimit",
  "auditContextMiddleware",
] as const;

export type CommonEntryName = (typeof COMMON_ENTRY_NAMES)[number];

/**
 * Returns the shared chain fragment in canonical mount order:
 *   requestContextInit -> trimTrailingSlash -> httpLogger -> cors ->
 *   globalRateLimit -> auditContextMiddleware
 *
 * The list is fresh per call (no shared mutation) and uses the exact
 * `ChainEntry` discriminants the well-formedness guard expects.
 */
export function commonEntries<E extends HonoEnv>(
  deps: CommonEntryDeps<E>
): ChainEntry<E>[] {
  const corsRequires = deps.cors.extraRequires ?? [];
  const auditRequires = deps.auditContextRequires ?? ["requestContextInit"];

  return [
    {
      kind: "use",
      name: "requestContextInit",
      mount: deps.requestContextInit,
    },
    {
      kind: "use",
      name: "trimTrailingSlash",
      mount: trimTrailingSlash(),
    },
    {
      kind: "use",
      name: "httpLogger",
      mount: deps.httpLoggerSink
        ? httpLogger(deps.httpLoggerSink)
        : httpLogger(),
    },
    {
      kind: "use-path",
      name: "cors",
      path: "/*",
      mount: cors({
        origin: [...deps.cors.origin],
        allowMethods: ["GET", "POST", "OPTIONS", "PATCH", "DELETE", "PUT"],
        allowHeaders: ["Content-Type", "Authorization"],
        credentials: true,
      }),
      requires: corsRequires.length > 0 ? corsRequires : undefined,
    },
    {
      kind: "use",
      name: "globalRateLimit",
      mount: deps.globalRateLimit,
      requires: ["cors"],
    },
    {
      kind: "use",
      name: "auditContextMiddleware",
      mount: deps.auditContextMiddleware,
      requires: auditRequires,
    },
  ];
}

/**
 * Same as `commonEntries` but indexed by entry name. Server interleaves
 * the tenancy block between early and late common entries, so it picks
 * `byName.requestContextInit`, ..., and pushes them in the order it needs
 * while still inheriting the factory wiring.
 */
export function commonEntriesByName<E extends HonoEnv>(
  deps: CommonEntryDeps<E>
): Record<CommonEntryName, ChainEntry<E>> {
  const entries = commonEntries(deps);
  // boundary: `Record<CommonEntryName, ChainEntry<E>>` requires a complete
  // map; the array is built from a fixed-name list so every key is
  // populated. We assert that invariant at runtime below.
  const out: Partial<Record<CommonEntryName, ChainEntry<E>>> = {};
  for (const entry of entries) {
    out[entry.name as CommonEntryName] = entry;
  }
  for (const name of COMMON_ENTRY_NAMES) {
    if (!out[name]) {
      throw new Error(`commonEntriesByName: missing entry "${name}"`);
    }
  }
  return out as Record<CommonEntryName, ChainEntry<E>>;
}
