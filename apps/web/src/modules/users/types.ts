import { USER_STATUS_CONFIG as SHARED_USER_STATUS_CONFIG } from "@repo/shared/users";
import type { GetUserResponse, ListUsersResponse } from "@/api.gen/types.gen";

export type User = ListUsersResponse["data"][number];
export type UserDetail = GetUserResponse["user"];

export type UserStatus = "active" | "inactive" | "locked";

export const USER_STATUS_CONFIG = SHARED_USER_STATUS_CONFIG;
