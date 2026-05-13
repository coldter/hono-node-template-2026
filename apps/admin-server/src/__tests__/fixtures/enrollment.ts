/**
 * Typed factories for the test-local `EnrollmentRow` shape used by the
 * drizzle structural stubs in `enroll/__tests__/lifecycle.test.ts` and
 * `enroll/__tests__/routes.test.ts`.
 *
 * The Row shape is a deliberate subset of `GlobalAdmin` from
 * `@repo/db/schema` — only the columns the stubs project on/mutate. Using a
 * tagged factory function (rather than ad-hoc object literals) keeps every
 * fixture exercising exactly the discriminator that names it: a "pending"
 * row has a hash + future expiry, "bound" has boundAt + userId, "expired"
 * has neither hash nor boundAt.
 */

import type { GlobalAdminSubRole } from "@repo/db/schema";

export type EnrollmentRow = {
  id: string;
  email: string;
  subRole: GlobalAdminSubRole;
  enrollmentTokenHash: Buffer | null;
  enrollmentExpiresAt: Date | null;
  boundAt: Date | null;
  userId: string | null;
  createdAt: Date;
};

type EnrollmentOverrides = Partial<EnrollmentRow>;

function baseRow(now: Date, overrides?: EnrollmentOverrides): EnrollmentRow {
  return {
    id: "ga_test",
    email: "test@example.com",
    subRole: "support",
    enrollmentTokenHash: null,
    enrollmentExpiresAt: null,
    boundAt: null,
    userId: null,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Pending enrollment: token hash present, expiry in the future, not yet
 * redeemed. Default expiry is `now + 60s` so tests do not race the wall
 * clock.
 */
export function buildPendingEnrollment(
  now: Date,
  overrides?: EnrollmentOverrides
): EnrollmentRow {
  return baseRow(now, {
    id: "ga_pending",
    enrollmentTokenHash: Buffer.from("aa", "hex"),
    enrollmentExpiresAt: new Date(now.getTime() + 60_000),
    ...overrides,
  });
}

/**
 * Bound enrollment: redemption has happened, hash is cleared, `boundAt` and
 * `userId` are set. Terminal — invites/expires against this row must throw.
 */
export function buildBoundEnrollment(
  now: Date,
  overrides?: EnrollmentOverrides
): EnrollmentRow {
  return baseRow(now, {
    id: "ga_bound",
    enrollmentTokenHash: null,
    enrollmentExpiresAt: null,
    boundAt: now,
    userId: "usr_bound",
    ...overrides,
  });
}

/**
 * Expired enrollment: hash already cleared, never bound. Terminal — `expire`
 * against this row is a no-op (idempotent), invites against the email are
 * permitted as a fresh transition.
 */
export function buildExpiredEnrollment(
  now: Date,
  overrides?: EnrollmentOverrides
): EnrollmentRow {
  return baseRow(now, {
    id: "ga_expired",
    enrollmentTokenHash: null,
    enrollmentExpiresAt: null,
    boundAt: null,
    userId: null,
    ...overrides,
  });
}
