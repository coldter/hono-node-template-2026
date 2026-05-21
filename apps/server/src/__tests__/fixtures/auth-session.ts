/**
 * Typed factories for `AuthSession["user"]` / `AuthSession["session"]`. Defaults
 * fill every required field so tests can supply only what they care about
 * without an `as unknown as` widening cast.
 */

import type { AuthSession } from "@/modules/auth/instance";

export type AuthUserOverrides = Partial<AuthSession["user"]> &
  Readonly<Record<string, unknown>> & {
    readonly id: AuthSession["user"]["id"];
  };

export type AuthSessionOverrides = Partial<AuthSession["session"]> &
  Readonly<Record<string, unknown>> & {
    readonly id: AuthSession["session"]["id"];
  };

const EPOCH = new Date(0);

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
