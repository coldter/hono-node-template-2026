export const USER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  LOCKED: "locked",
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const USER_STATUS_VALUES = Object.values(USER_STATUS) as [
  UserStatus,
  ...UserStatus[],
];

export const USER_STATUS_CONFIG = {
  [USER_STATUS.ACTIVE]: {
    label: "Active",
    variant: "default",
    color: "green",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  [USER_STATUS.INACTIVE]: {
    label: "Inactive",
    variant: "secondary",
    color: "gray",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  [USER_STATUS.LOCKED]: {
    label: "Locked",
    variant: "destructive",
    color: "red",
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
} as const;
