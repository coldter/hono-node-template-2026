export {
  USER_STATUS,
  USER_STATUS_VALUES,
  type UserStatus,
  userStatusSchema,
} from "@repo/shared/users";

export const USERS_SORT_COLUMNS = {
  createdAt: "createdAt",
  email: "email",
  name: "name",
  status: "status",
  updatedAt: "updatedAt",
} as const;

export const USERS_SORT_COLUMN_VALUES = Object.values(USERS_SORT_COLUMNS) as [
  (typeof USERS_SORT_COLUMNS)[keyof typeof USERS_SORT_COLUMNS],
  ...(typeof USERS_SORT_COLUMNS)[keyof typeof USERS_SORT_COLUMNS][],
];
