/**
 * Unified lifecycle writer for `tenant_custom_hostnames` rows.
 *
 * State-transition table (single source of truth)
 * -----------------------------------------------
 *   pending_txt    →  awaiting_caddy  (TXT verified)
 *                  →  failed          (no TXT after PENDING_TXT_FAILURE_AGE_MS)
 *   awaiting_caddy →  active          (Caddy issued the cert)
 *   failed         →  awaiting_caddy  (TXT re-verified)
 *   removing       →  removed         (storage cleaned up / settle elapsed)
 *
 * Bookkeeping (no transition arrow) is also written through this module so
 * the `verification_errors` 10-cap and `last_reconciled_at` bumping live in
 * one place. The invalidator is bumped exactly when a real state transition
 * happens; bookkeeping writes do not bump.
 *
 * Why one module: the HTTP service (verify-txt, remove) and the reconciler
 * (cron-driven advances) both write the same columns under the same rules.
 * Without unification, the state machine is duplicated and drift is one
 * misplaced branch away.
 */

import {
  type DrizzleClient,
  generatePrefixedCuid,
  ID_PREFIXES,
} from "@repo/db";
import {
  type CustomHostnameLifecycle,
  type TenantCustomHostname,
  tenantCustomHostnames,
} from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import { eq } from "drizzle-orm";
import { CustomHostnameError } from "./custom-hostname-errors";
import { resolveTxt as defaultResolveTxt } from "./doh-resolver";
import {
  type TxtVerificationResult,
  verifyTxtRecord,
} from "./txt-verification";

export type VerificationToken =
  `${typeof ID_PREFIXES.verificationToken}_${string}`;

export function generateVerificationToken(): VerificationToken {
  return generatePrefixedCuid(ID_PREFIXES.verificationToken);
}

/** Maximum number of entries retained in `verification_errors`. */
export const VERIFICATION_ERRORS_CAP = 10;

/**
 * Allowed forward arrows. Terminal states (`active`, `removed`) have no
 * outgoing arrows in this module; `active → removing` is initiated by the
 * service's `remove()` (which uses intent `start_removal`, see below).
 */
const TRANSITIONS: Readonly<
  Record<CustomHostnameLifecycle, ReadonlySet<CustomHostnameLifecycle>>
> = {
  pending_txt: new Set(["awaiting_caddy", "failed"]),
  awaiting_caddy: new Set(["active"]),
  failed: new Set(["awaiting_caddy"]),
  removing: new Set(["removed"]),
  active: new Set(["removing"]),
  removed: new Set(),
};

export type LifecycleDeps = Readonly<{
  db: DrizzleClient;
  invalidator: Invalidator;
}>;

/**
 * A described state change. `kind === "transition"` advances `lifecycleStatus`
 * and bumps the invalidator; `kind === "bookkeeping"` only writes the
 * supporting columns and never bumps. `kind === "noop"` writes nothing.
 */
export type Transition =
  | {
      kind: "transition";
      next: CustomHostnameLifecycle;
      verificationVerifiedAt?: Date;
      verificationErrors?: readonly string[];
    }
  | {
      kind: "bookkeeping";
      verificationErrors?: readonly string[];
    }
  | { kind: "noop" };

type WriteResult = {
  row: TenantCustomHostname;
  transitioned: boolean;
};

/**
 * Apply a `Transition` to `row`. The only writer for `lifecycleStatus`,
 * `verificationVerifiedAt`, `verificationErrors`, `lastReconciledAt` on
 * tenant_custom_hostnames.
 *
 * `lastReconciledAt` defaults to `now`; callers may omit it for the service
 * paths (which pass `undefined`) — the column is harmlessly bumped on every
 * write so the reconciler's debounce keeps working after a manual verify.
 */
export async function applyTransition(
  row: TenantCustomHostname,
  transition: Transition,
  deps: LifecycleDeps,
  now: Date = new Date()
): Promise<WriteResult> {
  if (transition.kind === "noop") {
    return { row, transitioned: false };
  }

  if (transition.kind === "transition") {
    const allowed = TRANSITIONS[row.lifecycleStatus];
    if (!allowed.has(transition.next)) {
      throw new CustomHostnameError(
        "invalid_transition",
        `Cannot transition from ${row.lifecycleStatus} to ${transition.next}`
      );
    }
  }

  const patch: Partial<{
    lifecycleStatus: CustomHostnameLifecycle;
    verificationVerifiedAt: Date;
    verificationErrors: string[];
    lastReconciledAt: Date;
  }> = { lastReconciledAt: now };

  if (transition.kind === "transition") {
    patch.lifecycleStatus = transition.next;
    if (transition.verificationVerifiedAt) {
      patch.verificationVerifiedAt = transition.verificationVerifiedAt;
    }
  }

  if (transition.verificationErrors) {
    patch.verificationErrors = [...transition.verificationErrors].slice(
      -VERIFICATION_ERRORS_CAP
    );
  }

  const updated = await deps.db
    .update(tenantCustomHostnames)
    .set(patch)
    .where(eq(tenantCustomHostnames.id, row.id))
    .returning();
  const writtenRow = updated[0];
  if (!writtenRow) {
    throw new CustomHostnameError("not_found");
  }

  if (transition.kind === "transition") {
    // The row update above is not wrapped in `db.transaction(...)` here —
    // the writer is a single statement. We pass `deps.db` directly to
    // `bumpDurable` so the counter is bumped against the same executor;
    // broadcast is fire-and-forget. Invalidator failure is logged +
    // swallowed in the production invalidator (see createFanOutInvalidator).
    await deps.invalidator.bumpDurable(deps.db);
    await deps.invalidator.broadcast(writtenRow.hostname);
  }

  return { row: writtenRow, transitioned: transition.kind === "transition" };
}

/**
 * Run the TXT check for `row`. Decision-free — the caller decides what
 * `Transition` to apply based on the result + scheduling rules.
 */
export async function runTxtVerification(
  row: TenantCustomHostname,
  deps: Readonly<{
    resolveTxt: (name: string) => Promise<string[][]>;
    txtLabel: string;
  }>
): Promise<TxtVerificationResult> {
  return await verifyTxtRecord(row.hostname, row.verificationToken, {
    resolveTxt: deps.resolveTxt ?? defaultResolveTxt,
    label: deps.txtLabel,
  });
}

export function formatVerificationError(
  now: Date,
  reason: "no_record" | "mismatch" | "resolver_error"
): string {
  return `${now.toISOString()} ${reason}`;
}

export function appendVerificationError(
  existing: readonly string[],
  next: string
): string[] {
  return [...existing, next].slice(-VERIFICATION_ERRORS_CAP);
}
