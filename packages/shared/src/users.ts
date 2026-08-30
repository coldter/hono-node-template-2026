import { z } from "zod";

export const USER_STATUS = {
  ACTIVE: "active",
  DELETED: "deleted",
  INACTIVE: "inactive",
  LOCKED: "locked",
} as const;

export const USER_STATUS_VALUES = Object.values(USER_STATUS) as [
  (typeof USER_STATUS)[keyof typeof USER_STATUS],
  ...(typeof USER_STATUS)[keyof typeof USER_STATUS][],
];

export const userStatusSchema = z.enum(USER_STATUS_VALUES);

export type UserStatus = z.infer<typeof userStatusSchema>;

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
