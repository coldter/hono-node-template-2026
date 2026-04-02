import type { USER_STATUS } from "./constants";

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export interface ListUsersQuery {
  order?: "asc" | "desc";
  page?: number;
  perPage?: number;
  role?: string;
  search?: string;
  sort?: string;
  status?: UserStatus;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  roleSlugs: string[];
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
}

export interface UpdateUserRolesInput {
  roleSlugs: string[];
}

export interface UserRecord {
  createdAt: Date;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivatedReason: string | null;
  email: string;
  emailVerified: boolean;
  failedLoginAttempts: number;
  id: string;
  image: string | null;
  lockedUntil: Date | null;
  name: string;
  roleSlugs: string[];
  status: string;
  updatedAt: Date;
}
