import { z } from "zod";

export const USER_STATUS = {
  ACTIVE: "active",
  DELETED: "deleted",
  INACTIVE: "inactive",
  LOCKED: "locked",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const USER_STATUS_VALUES: readonly UserStatus[] =
  Object.values(USER_STATUS);

const USER_STATUS_SET: ReadonlySet<string> = new Set<string>(
  USER_STATUS_VALUES
);

export function isUserStatus(value: string): value is UserStatus {
  return USER_STATUS_SET.has(value);
}

export const userStatusSchema = z.enum(USER_STATUS_VALUES);

export const USER_STATUS_CONFIG = {
  [USER_STATUS.ACTIVE]: {
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    color: "green",
    label: "Active",
    variant: "default",
  },
  [USER_STATUS.INACTIVE]: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    color: "gray",
    label: "Inactive",
    variant: "secondary",
  },
  [USER_STATUS.LOCKED]: {
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    color: "red",
    label: "Locked",
    variant: "destructive",
  },
} as const;
