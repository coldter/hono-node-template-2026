/**
 * Typed factories for `AuthSession["user"]` and `AuthSession["session"]`
 * test fixtures.
 *
 * Better Auth's `$Infer["Session"]` is heavily plugin-augmented; the
 * resolved type pulls in fields tests neither set nor assert against
 * (timestamps, organization-plugin metadata, etc.). The factories below
 * fill in safe defaults for every required field so test sites can
 * construct just the fields they care about, and the returned shape is
 * a structurally-complete `AuthSession["user"]` / `AuthSession["session"]`
 * — no `as unknown as` widening required.
 */

import type { AuthSession } from "@/modules/auth/instance";

/**
 * Test overrides are partials of the augmented shape, plus an open record
 * of additional plugin fields (e.g. org-plugin `activeOrganizationId`,
 * `activeTeamId`) that may not be in the strict `$Infer` shape. The `id`
 * is the only mandatory override.
 */
export type AuthUserOverrides = Partial<AuthSession["user"]> &
  Readonly<Record<string, unknown>> & {
    readonly id: AuthSession["user"]["id"];
  };

export type AuthSessionOverrides = Partial<AuthSession["session"]> &
  Readonly<Record<string, unknown>> & {
    readonly id: AuthSession["session"]["id"];
  };

const EPOCH = new Date(0);

/**
 * Build an `AuthSession["user"]`. Only `id` is required; every other field
 * gets a safe default so the returned value satisfies the augmented shape
 * without a widening cast.
 */
export function makeAuthUser(
  overrides: AuthUserOverrides
): AuthSession["user"] {
  const defaults = {
    createdAt: EPOCH,
    updatedAt: EPOCH,
    email: "",
    emailVerified: false,
    name: "",
    image: null,
    status: "active",
    deactivatedAt: null,
    deactivatedBy: null,
    deactivatedReason: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    roleSlugs: [],
    onboardingCompletedAt: null,
    twoFactorEnabled: false,
  } satisfies Omit<AuthSession["user"], "id">;
  return { ...defaults, ...overrides };
}

/**
 * Build an `AuthSession["session"]`. Only `id` is required; tenancy /
 * org-plugin fields like `activeOrganizationId` can be supplied via the
 * overrides record.
 */
export function makeAuthSession(
  overrides: AuthSessionOverrides
): AuthSession["session"] {
  const defaults = {
    createdAt: EPOCH,
    updatedAt: EPOCH,
    userId: "",
    expiresAt: EPOCH,
    token: "",
    ipAddress: null,
    userAgent: null,
    platform: "web",
    activeOrgRole: null,
  } satisfies Omit<AuthSession["session"], "id">;
  return { ...defaults, ...overrides };
}
