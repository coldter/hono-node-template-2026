import { z } from "zod";
import { USER_STATUS_VALUES } from "./constants";

const userStatusSchema = z.enum(USER_STATUS_VALUES);

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
  const parsedStatus = userStatusSchema.safeParse(user.status);
  if (!parsedStatus.success) {
    return null;
  }
  return {
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    image: user.image,
    name: user.name,
    roleSlugs: user.roleSlugs,
    status: parsedStatus.data,
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toUserDetailResponse(user: UserDetailRecord) {
  const parsedStatus = userStatusSchema.safeParse(user.status);
  if (!parsedStatus.success) {
    return null;
  }
  return {
    createdAt: user.createdAt.toISOString(),
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
    deactivatedBy: user.deactivatedBy,
    deactivatedReason: user.deactivatedReason,
    email: user.email,
    emailVerified: user.emailVerified,
    failedLoginAttempts: user.failedLoginAttempts,
    id: user.id,
    image: user.image,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    name: user.name,
    roleSlugs: user.roleSlugs,
    status: parsedStatus.data,
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toMyAccountResponse(user: MyAccountRecord) {
  return {
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    image: user.image,
    name: user.name,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  };
}
