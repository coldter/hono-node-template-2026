import { USER_STATUS as SHARED_USER_STATUS } from "@repo/shared/users";

export const USER_STATUS = SHARED_USER_STATUS;

export const USER_STATUS_VALUES = Object.values(USER_STATUS) as [
  (typeof USER_STATUS)[keyof typeof USER_STATUS],
  ...(typeof USER_STATUS)[keyof typeof USER_STATUS][],
];

export const USERS_SORT_COLUMNS = {
  name: "name",
  email: "email",
  status: "status",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
} as const;

export const USERS_SORT_COLUMN_VALUES = Object.values(USERS_SORT_COLUMNS) as [
  (typeof USERS_SORT_COLUMNS)[keyof typeof USERS_SORT_COLUMNS],
  ...(typeof USERS_SORT_COLUMNS)[keyof typeof USERS_SORT_COLUMNS][],
];
