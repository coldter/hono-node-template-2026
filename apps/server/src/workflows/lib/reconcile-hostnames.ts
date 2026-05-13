/**
 * Custom-hostname reconciler business logic. The Hatchet wrapper
 * (`../reconcile-hostnames.ts`) calls `scan()` on a 1-min cron; tests
 * exercise `scan` and `reconcileOne` directly with a structural Drizzle stub.
 *
 * All DB writes for `tenant_custom_hostnames` go through `lifecycle.ts` —
 * this module owns only scheduling concerns: the 5-min settle for
 * `removing → removed`, the `caddyCertStorageKey` signal for
 * `awaiting_caddy → active`, the 7-day age threshold for
 * `pending_txt → failed`, and the 50-second debounce on the scan query.
 */

import type { DrizzleClient } from "@repo/db";
import {
  type CustomHostnameLifecycle,
  type TenantCustomHostname,
  tenantCustomHostnames,
} from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import { and, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { resolveTxt as defaultResolveTxt } from "@/modules/tenancy/doh-resolver";
import {
  appendVerificationError,
  applyTransition,
  formatVerificationError,
  runTxtVerification,
  type Transition,
} from "@/modules/tenancy/lifecycle";

/**
 * Statuses the scan picks up. `active` is excluded — drift detection is
 * deferred; `removed` is terminal.
 */
const RECONCILABLE_STATUSES = [
  "pending_txt",
  "awaiting_caddy",
  "failed",
  "removing",
] as const satisfies readonly CustomHostnameLifecycle[];

/** Age threshold for `pending_txt` → `failed` if TXT still fails. */
const PENDING_TXT_FAILURE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Settle time before a `removing` row flips to `removed`. */
const REMOVING_SETTLE_MS = 5 * 60 * 1000;

/** Skip reconciling rows we touched in the last 50 seconds. */
const RECONCILE_DEBOUNCE_SECONDS = 50;

export type ReconcilerDeps = Readonly<{
  db: DrizzleClient;
  resolveTxt: (name: string) => Promise<string[][]>;
  invalidator: Invalidator;
  txtLabel: string;
  /** Defaults to `() => new Date()`; injectable for tests. */
  now?: () => Date;
}>;

function nowOf(deps: ReconcilerDeps): Date {
  return deps.now ? deps.now() : new Date();
}

export async function scan(deps: ReconcilerDeps): Promise<void> {
  const rows = await deps.db
    .select()
    .from(tenantCustomHostnames)
    .where(
      and(
        inArray(tenantCustomHostnames.lifecycleStatus, [
          ...RECONCILABLE_STATUSES,
        ]),
        or(
          isNull(tenantCustomHostnames.lastReconciledAt),
          lt(
            tenantCustomHostnames.lastReconciledAt,
            sql`now() - (${RECONCILE_DEBOUNCE_SECONDS} || ' seconds')::interval`
          )
        )
      )
    );

  for (const row of rows) {
    await reconcileOne(row, deps);
  }
}

export type ReconcileOutcome = Readonly<{
  status: CustomHostnameLifecycle;
  transitioned: boolean;
  errorAppended?: string;
}>;

export async function reconcileOne(
  row: TenantCustomHostname,
  deps: ReconcilerDeps
): Promise<ReconcileOutcome> {
  const now = nowOf(deps);
  const decision = await decideTransition(row, deps, now);
  return await applyDecision(row, decision, deps, now);
}

type Decision = {
  transition: Transition;
  errorAppended?: string;
  /** Status the row will hold after the decision is applied. */
  resultingStatus: CustomHostnameLifecycle;
};

async function decideTransition(
  row: TenantCustomHostname,
  deps: ReconcilerDeps,
  now: Date
): Promise<Decision> {
  // biome-ignore lint/style/useDefaultSwitchClause: exhaustive on CustomHostnameLifecycle; default would silence drift detection
  switch (row.lifecycleStatus) {
    case "pending_txt":
      return await decidePendingTxt(row, deps, now);
    case "awaiting_caddy":
      return decideAwaitingCaddy(row);
    case "failed":
      return await decideFailed(row, deps, now);
    case "removing":
      return decideRemoving(row, now);
    case "active":
    case "removed":
      return {
        transition: { kind: "noop" },
        resultingStatus: row.lifecycleStatus,
      };
  }
}

async function decidePendingTxt(
  row: TenantCustomHostname,
  deps: ReconcilerDeps,
  now: Date
): Promise<Decision> {
  const result = await runTxtVerification(row, deps);
  if (result.ok) {
    return {
      transition: {
        kind: "transition",
        next: "awaiting_caddy",
        verificationVerifiedAt: now,
      },
      resultingStatus: "awaiting_caddy",
    };
  }

  const errorReason = formatVerificationError(now, result.reason);
  const nextErrors = appendVerificationError(
    row.verificationErrors,
    errorReason
  );
  const ageMs = now.getTime() - row.createdAt.getTime();

  if (ageMs >= PENDING_TXT_FAILURE_AGE_MS) {
    return {
      transition: {
        kind: "transition",
        next: "failed",
        verificationErrors: nextErrors,
      },
      errorAppended: errorReason,
      resultingStatus: "failed",
    };
  }

  return {
    transition: { kind: "bookkeeping", verificationErrors: nextErrors },
    errorAppended: errorReason,
    resultingStatus: "pending_txt",
  };
}

function decideAwaitingCaddy(row: TenantCustomHostname): Decision {
  if (row.caddyCertStorageKey) {
    return {
      transition: { kind: "transition", next: "active" },
      resultingStatus: "active",
    };
  }
  return {
    transition: { kind: "bookkeeping" },
    resultingStatus: "awaiting_caddy",
  };
}

async function decideFailed(
  row: TenantCustomHostname,
  deps: ReconcilerDeps,
  now: Date
): Promise<Decision> {
  const result = await runTxtVerification(row, deps);
  if (result.ok) {
    return {
      transition: {
        kind: "transition",
        next: "awaiting_caddy",
        verificationVerifiedAt: now,
      },
      resultingStatus: "awaiting_caddy",
    };
  }

  const errorReason = formatVerificationError(now, result.reason);
  const nextErrors = appendVerificationError(
    row.verificationErrors,
    errorReason
  );
  return {
    transition: { kind: "bookkeeping", verificationErrors: nextErrors },
    errorAppended: errorReason,
    resultingStatus: "failed",
  };
}

function decideRemoving(row: TenantCustomHostname, now: Date): Decision {
  const ageMs = now.getTime() - row.updatedAt.getTime();
  if (ageMs >= REMOVING_SETTLE_MS) {
    return {
      transition: { kind: "transition", next: "removed" },
      resultingStatus: "removed",
    };
  }
  return {
    transition: { kind: "bookkeeping" },
    resultingStatus: "removing",
  };
}

async function applyDecision(
  row: TenantCustomHostname,
  decision: Decision,
  deps: ReconcilerDeps,
  now: Date
): Promise<ReconcileOutcome> {
  if (decision.transition.kind === "noop") {
    return { status: decision.resultingStatus, transitioned: false };
  }
  const out = await applyTransition(
    row,
    decision.transition,
    { db: deps.db, invalidator: deps.invalidator },
    now
  );
  return {
    status: decision.resultingStatus,
    transitioned: out.transitioned,
    errorAppended: decision.errorAppended,
  };
}

export function defaultReconcilerDeps(
  overrides: Pick<ReconcilerDeps, "db" | "invalidator" | "txtLabel"> &
    Partial<ReconcilerDeps>
): ReconcilerDeps {
  return {
    db: overrides.db,
    resolveTxt: overrides.resolveTxt ?? defaultResolveTxt,
    invalidator: overrides.invalidator,
    txtLabel: overrides.txtLabel,
    now: overrides.now,
  };
}
