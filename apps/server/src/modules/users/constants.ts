export {
  USER_STATUS,
  USER_STATUS_VALUES,
  type UserStatus,
  userStatusSchema,
} from "@repo/shared/users";

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
