import { z } from "@hono/zod-openapi";

import {
  createPaginatedResponseSchema,
  paginationQuerySchema,
} from "@/utils/pagination";

import { USER_STATUS_VALUES, USERS_SORT_COLUMN_VALUES } from "./constants";

export const userParamsSchema = z.object({
  userId: z
    .string()
    .min(1)
    .openapi({
      description: "User ID",
      param: { in: "path", name: "userId" },
    }),
});

export const listUsersQuerySchema = z
  .object({
    role: z.string().optional().openapi({ description: "Filter by role slug" }),
    search: z
      .string()
      .optional()
      .openapi({ description: "Search by name or email" }),
    sort: z
      .enum(USERS_SORT_COLUMN_VALUES)
      .optional()
      .openapi({ description: "Sort column" }),
    status: z
      .enum(USER_STATUS_VALUES)
      .optional()
      .openapi({ description: "Filter by status" }),
  })
  .extend(paginationQuerySchema.shape);

export const userSchema = z.object({
  createdAt: z.string().datetime(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  id: z.string(),
  image: z.string().nullable(),
  name: z.string(),
  roleSlugs: z.array(z.string()),
  status: z.enum(USER_STATUS_VALUES),
  updatedAt: z.string().datetime(),
});

export const userDetailSchema = userSchema.extend({
  deactivatedAt: z.string().datetime().nullable(),
  deactivatedBy: z.string().nullable(),
  deactivatedReason: z.string().nullable(),
  failedLoginAttempts: z.number(),
  lockedUntil: z.string().datetime().nullable(),
});

export const myAccountSchema = z.object({
  createdAt: z.string().datetime(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  id: z.string(),
  image: z.string().nullable(),
  name: z.string(),
  onboardingCompletedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export const listUsersResponseSchema = createPaginatedResponseSchema(
  userSchema,
  "Paginated users list"
);

export const getUserResponseSchema = z.object({
  user: userDetailSchema,
});

export const createUserBodySchema = z.object({
  email: z.string().email().openapi({ description: "User email address" }),
  name: z.string().min(1).max(100).openapi({ description: "User full name" }),
  password: z
    .string()
    .min(8)
    .max(72)
    .openapi({ description: "Initial password (min 8 characters)" }),
  roleSlugs: z
    .array(z.string())
    .min(1)
    .openapi({ description: "Role slugs to assign" }),
});

export const createUserResponseSchema = z.object({
  user: userSchema,
});

export const updateUserBodySchema = z.object({
  email: z.email().optional(),
  name: z.string().min(1).max(100).optional(),
});

export const updateUserResponseSchema = z.object({
  user: userSchema,
});

export const updateUserRolesBodySchema = z.object({
  roleSlugs: z.array(z.string()).min(1).openapi({
    description: "New role slugs (replaces existing)",
  }),
});

export const deactivateUserBodySchema = z.object({
  reason: z.string().max(500).optional().openapi({
    description: "Reason for deactivation",
  }),
});

export const successResponseSchema = z.object({
  success: z.boolean(),
});

export const getMyAccountResponseSchema = z.object({
  notifications: z.object({
    unreadCount: z.number().int(),
  }),
  profile: myAccountSchema,
});
