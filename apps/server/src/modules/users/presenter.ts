import type { UserStatus } from "./types";

type UserSummaryRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  status: string;
  roleSlugs: string[];
  createdAt: Date;
  updatedAt: Date;
};

type UserDetailRecord = UserSummaryRecord & {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivatedReason: string | null;
};

type MyAccountRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toUserSummaryResponse(user: UserSummaryRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    status: user.status as UserStatus,
    roleSlugs: user.roleSlugs,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toUserDetailResponse(user: UserDetailRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    status: user.status as UserStatus,
    roleSlugs: user.roleSlugs,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    deactivatedBy: user.deactivatedBy,
    deactivatedReason: user.deactivatedReason,
  };
}

export function toMyAccountResponse(user: MyAccountRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
