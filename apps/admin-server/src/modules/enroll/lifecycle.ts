/**
 * Unified lifecycle writer for `global_admins` enrollment rows.
 *
 * State-transition table (single source of truth)
 * -----------------------------------------------
 *   null     →  pending   (invite — insert row with hashed token + expiry)
 *   pending  →  bound     (redeem — create BA user + account; mark boundAt)
 *   pending  →  expired   (expire — clear token; row remains for audit)
 *
 * `bound` and `expired` are terminal. Re-applying any transition to a
 * terminal row raises `invalid_transition`. Re-inviting an existing email
 * for which a pending row already lives raises `duplicate_invite`; the
 * caller should expire the live invitation first if they want to rotate
 * the token.
 *
 * Why one module: the HTTP invite endpoint, the redeem endpoint, and the
 * explicit-expire endpoint all touch the same row + the same companion
 * writes (BA user/account on redeem, audit row on every arrow). Without
 * unification, the state machine is duplicated and drift is one branch
 * away.
 *
 * State derivation (no enum column on the table):
 *   pending  := boundAt IS NULL AND enrollmentTokenHash IS NOT NULL
 *               AND enrollmentExpiresAt > now
 *   bound    := boundAt IS NOT NULL
 *   expired  := boundAt IS NULL AND
 *               (enrollmentTokenHash IS NULL OR enrollmentExpiresAt <= now)
 *
 * The "redeem after expiration" arrow falls through to `expire` when the
 * caller invokes redeem on a now-elapsed row: the writer clears the token
 * and raises `expired` rather than silently flipping to `bound`.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { OperatorSubRole } from "@repo/authorization";
import {
  type DrizzleClient,
  generateIdForModel,
  generatePrefixedCuid,
  ID_PREFIXES,
} from "@repo/db";
import {
  accounts,
  auditLogs,
  type GlobalAdmin,
  globalAdmins,
  users,
} from "@repo/db/schema";
import { ACTOR_TYPES } from "@repo/shared/audit";
import {
  assertArrow as assertLifecycleArrow,
  LifecycleError,
  type TransitionTable,
} from "@repo/tenant-operations";
import { and, eq, isNull } from "drizzle-orm";

export type EnrollmentLifecycleErrorCode =
  | "invalid_transition"
  | "not_found"
  | "duplicate_invite"
  | "invalid_token"
  | "expired"
  | "already_bound";

export class EnrollmentLifecycleError extends LifecycleError<EnrollmentLifecycleErrorCode> {
  constructor(code: EnrollmentLifecycleErrorCode, message?: string) {
    super(code, message);
    this.name = "EnrollmentLifecycleError";
  }
}

export type EnrollmentState = "pending" | "bound" | "expired";

export const TRANSITIONS: TransitionTable<EnrollmentState> = {
  pending: new Set<EnrollmentState>(["bound", "expired"]),
  bound: new Set<EnrollmentState>(),
  expired: new Set<EnrollmentState>(),
};

export type EnrollmentActor = Readonly<{ id: string }>;

export type InviteData = Readonly<{
  email: string;
  subRole: OperatorSubRole;
  ttlDays: number;
  actor: EnrollmentActor;
}>;

export type RedeemData = Readonly<{
  token: string;
  password: string;
  displayName?: string;
}>;

export type ExpireData = Readonly<{
  enrollmentId: string;
  actor: EnrollmentActor;
}>;

export type Transition =
  | { kind: "invite"; data: InviteData }
  | { kind: "redeem"; data: RedeemData }
  | { kind: "expire"; data: ExpireData };

export type LifecycleDeps = Readonly<{
  db: DrizzleClient;
  hashPassword: (password: string) => Promise<string>;
}>;

export type InviteResult = Readonly<{
  enrollmentId: string;
  token: string;
  expiresAt: Date;
}>;

export type RedeemResult = Readonly<{
  enrollmentId: string;
  userId: string;
  email: string;
  subRole: OperatorSubRole;
}>;

export type ExpireResult = Readonly<{
  enrollmentId: string;
}>;

export type ApplyResult = InviteResult | RedeemResult | ExpireResult;

export const MIN_TTL_DAYS = 1;
export const MAX_TTL_DAYS = 30;

function deriveState(row: GlobalAdmin, now: Date): EnrollmentState {
  if (row.boundAt) {
    return "bound";
  }
  if (!row.enrollmentTokenHash) {
    return "expired";
  }
  if (row.enrollmentExpiresAt && row.enrollmentExpiresAt <= now) {
    return "expired";
  }
  return "pending";
}

function assertEnrollmentArrow(
  from: EnrollmentState,
  to: EnrollmentState
): void {
  assertLifecycleArrow(TRANSITIONS, from, to, EnrollmentLifecycleError);
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/**
 * Generate a fresh enrollment token. Returns the plaintext (handed to the
 * caller exactly once) and its sha256 digest (the column write). The hash
 * is what we store so a DB leak does not expose unredeemed tokens.
 */
export function generateEnrollmentToken(): {
  token: string;
  digest: Buffer;
} {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: hashToken(token) };
}

function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

async function loadPendingByToken(
  db: DrizzleClient,
  token: string
): Promise<GlobalAdmin> {
  const digest = hashToken(token);
  const rows = await db
    .select()
    .from(globalAdmins)
    .where(and(isNull(globalAdmins.boundAt), isNull(globalAdmins.userId)));
  for (const row of rows) {
    if (!row.enrollmentTokenHash) {
      continue;
    }
    if (constantTimeEquals(row.enrollmentTokenHash, digest)) {
      return row;
    }
  }
  throw new EnrollmentLifecycleError("invalid_token");
}

async function loadById(db: DrizzleClient, id: string): Promise<GlobalAdmin> {
  const rows = await db
    .select()
    .from(globalAdmins)
    .where(eq(globalAdmins.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new EnrollmentLifecycleError("not_found");
  }
  return row;
}

/**
 * The only writer for `global_admins.enrollmentTokenHash`,
 * `global_admins.enrollmentExpiresAt`, `global_admins.boundAt`, and the
 * BA user/account rows materialised by `redeem`. Each arrow emits exactly
 * one audit row (`operator.invited` / `operator.redeemed` / `operator.expired`).
 *
 * On `invite`: validates that no pending row already exists for the email,
 * inserts a fresh `global_admins` row with the hashed token + expiry, and
 * returns the plaintext token to the caller. The caller is responsible
 * for transporting the token to the invitee (email integration lands in a
 * later round; admin-server currently logs and returns the token in the
 * response body).
 *
 * On `redeem`: hashes the submitted token, finds the matching pending row,
 * fails closed if the row is expired (and proactively clears the hash so a
 * retry surfaces the same `expired` outcome), creates the BA user +
 * credential account, and flips the row to `bound`.
 *
 * On `expire`: idempotent on a row that is already terminal — the audit
 * row is NOT re-emitted in that case so a double-expire does not bloat the
 * audit feed.
 */
export async function applyEnrollmentTransition(
  transition: Transition,
  deps: LifecycleDeps,
  now: Date = new Date()
): Promise<ApplyResult> {
  if (transition.kind === "invite") {
    return await inviteOperator(transition.data, deps, now);
  }
  if (transition.kind === "redeem") {
    return await redeemEnrollment(transition.data, deps, now);
  }
  return await expireEnrollment(transition.data, deps, now);
}

async function inviteOperator(
  data: InviteData,
  deps: LifecycleDeps,
  now: Date
): Promise<InviteResult> {
  if (data.ttlDays < MIN_TTL_DAYS || data.ttlDays > MAX_TTL_DAYS) {
    throw new EnrollmentLifecycleError(
      "invalid_transition",
      `ttlDays must be between ${MIN_TTL_DAYS} and ${MAX_TTL_DAYS}`
    );
  }
  const existing = await deps.db
    .select()
    .from(globalAdmins)
    .where(eq(globalAdmins.email, data.email))
    .limit(1);
  const prior = existing[0];
  if (prior) {
    const state = deriveState(prior, now);
    if (state === "pending") {
      throw new EnrollmentLifecycleError("duplicate_invite");
    }
    if (state === "bound") {
      throw new EnrollmentLifecycleError("already_bound");
    }
    // Expired row: a re-invite would need to either delete the old row or
    // resurrect it. We treat each invite as fresh-row insert; the unique
    // constraint on email blocks the resurrection path. The caller's
    // recourse is to revoke + manually remove the tombstoned row out-of-
    // band, which is intentional friction.
    throw new EnrollmentLifecycleError(
      "duplicate_invite",
      "an expired enrollment exists for this email; remove it first"
    );
  }

  const { token, digest } = generateEnrollmentToken();
  const expiresAt = new Date(
    now.getTime() + data.ttlDays * 24 * 60 * 60 * 1000
  );
  const enrollmentId = generatePrefixedCuid(ID_PREFIXES.globalAdmin);

  await deps.db.transaction(async (tx) => {
    await tx.insert(globalAdmins).values({
      id: enrollmentId,
      email: data.email,
      subRole: data.subRole,
      enrollmentTokenHash: digest,
      enrollmentExpiresAt: expiresAt,
    });
    await tx.insert(auditLogs).values({
      event: "operator.invited",
      actorId: data.actor.id,
      actorType: ACTOR_TYPES.GLOBAL_ADMIN,
      targetId: enrollmentId,
      targetType: "user",
      metadata: {
        email: data.email,
        subRole: data.subRole,
        ttlDays: data.ttlDays,
        expiresAt: expiresAt.toISOString(),
      },
    });
  });

  return { enrollmentId, token, expiresAt };
}

async function redeemEnrollment(
  data: RedeemData,
  deps: LifecycleDeps,
  now: Date
): Promise<RedeemResult> {
  const row = await loadPendingByToken(deps.db, data.token);
  const state = deriveState(row, now);
  if (state === "bound") {
    throw new EnrollmentLifecycleError("already_bound");
  }
  if (state === "expired") {
    // Proactively clear the hash so a subsequent redeem surfaces the same
    // `expired` outcome via `invalid_token` (no row matches) rather than
    // re-walking the expiry branch.
    await deps.db
      .update(globalAdmins)
      .set({ enrollmentTokenHash: null })
      .where(eq(globalAdmins.id, row.id));
    throw new EnrollmentLifecycleError("expired");
  }
  assertEnrollmentArrow(state, "bound");

  const passwordHash = await deps.hashPassword(data.password);
  const userId = generateIdForModel("user");
  const accountId = generateIdForModel("account");
  const displayName = data.displayName?.trim() || row.email;

  await deps.db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: row.email,
      name: displayName,
      emailVerified: true,
    });
    await tx.insert(accounts).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
    await tx
      .update(globalAdmins)
      .set({
        userId,
        boundAt: now,
        enrollmentTokenHash: null,
        enrollmentExpiresAt: null,
      })
      .where(eq(globalAdmins.id, row.id));
    await tx.insert(auditLogs).values({
      event: "operator.redeemed",
      // Actor is the invitee themselves; their identity at this point is
      // the just-created BA user. Audit consumers rely on actorId being
      // populated for `operator.*` events.
      actorId: userId,
      actorType: ACTOR_TYPES.GLOBAL_ADMIN,
      targetId: row.id,
      targetType: "user",
      metadata: {
        email: row.email,
        subRole: row.subRole,
      },
    });
  });

  return {
    enrollmentId: row.id,
    userId,
    email: row.email,
    subRole: row.subRole,
  };
}

async function expireEnrollment(
  data: ExpireData,
  deps: LifecycleDeps,
  now: Date
): Promise<ExpireResult> {
  const row = await loadById(deps.db, data.enrollmentId);
  const state = deriveState(row, now);
  if (state === "bound") {
    throw new EnrollmentLifecycleError(
      "invalid_transition",
      "Cannot expire a bound operator"
    );
  }
  if (state === "expired") {
    // Already terminal: idempotent no-op, no audit re-emission.
    return { enrollmentId: row.id };
  }
  assertEnrollmentArrow(state, "expired");

  await deps.db.transaction(async (tx) => {
    await tx
      .update(globalAdmins)
      .set({ enrollmentTokenHash: null })
      .where(eq(globalAdmins.id, row.id));
    await tx.insert(auditLogs).values({
      event: "operator.expired",
      actorId: data.actor.id,
      actorType: ACTOR_TYPES.GLOBAL_ADMIN,
      targetId: row.id,
      targetType: "user",
      metadata: {
        email: row.email,
        subRole: row.subRole,
      },
    });
  });

  return { enrollmentId: row.id };
}
