import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { OperatorSubRole } from "@repo/authorization";
import {
  type DrizzleClient,
  firstOrThrow,
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
import { and, eq, gt, isNull } from "drizzle-orm";

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

// Plaintext is returned to the caller exactly once; only the sha256 digest is stored so a DB leak cannot expose unredeemed tokens.
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
  token: string,
  now: Date
): Promise<GlobalAdmin> {
  const digest = hashToken(token);
  const rows = await db
    .select()
    .from(globalAdmins)
    .where(
      and(
        isNull(globalAdmins.boundAt),
        isNull(globalAdmins.userId),
        gt(globalAdmins.enrollmentExpiresAt, now)
      )
    );
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
  return await firstOrThrow(
    db.select().from(globalAdmins).where(eq(globalAdmins.id, id)).limit(1),
    () => new EnrollmentLifecycleError("not_found")
  );
}

// Sole writer for `global_admins` enrollment columns and the BA user/account rows materialised by `redeem`; each arrow emits exactly one audit row.
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
    // Re-inviting an expired row requires manual removal first; the unique email constraint blocks resurrection (intentional friction).
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
  const row = await loadPendingByToken(deps.db, data.token, now);
  const state = deriveState(row, now);
  if (state === "bound") {
    throw new EnrollmentLifecycleError("already_bound");
  }
  if (state === "expired") {
    // Clear the hash so a subsequent redeem surfaces `invalid_token` rather than re-walking the expiry branch.
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
      // Actor is the invitee themselves; audit consumers rely on actorId being populated for `operator.*` events.
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
    // Idempotent no-op; no audit re-emission so double-expire does not bloat the feed.
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
