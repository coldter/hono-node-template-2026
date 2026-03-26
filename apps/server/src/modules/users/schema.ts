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
      param: { name: "userId", in: "path" },
      description: "User ID",
    }),
});

export const listUsersQuerySchema = z
  .object({
    search: z
      .string()
      .optional()
      .openapi({ description: "Search by name or email" }),
    status: z
      .enum(USER_STATUS_VALUES)
      .optional()
      .openapi({ description: "Filter by status" }),
    role: z.string().optional().openapi({ description: "Filter by role slug" }),
    sort: z
      .enum(USERS_SORT_COLUMN_VALUES)
      .optional()
      .openapi({ description: "Sort column" }),
  })
  .extend(paginationQuerySchema.shape);

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  status: z.enum(USER_STATUS_VALUES),
  roleSlugs: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const userDetailSchema = userSchema.extend({
  failedLoginAttempts: z.number(),
  lockedUntil: z.string().datetime().nullable(),
  deactivatedAt: z.string().datetime().nullable(),
  deactivatedBy: z.string().nullable(),
  deactivatedReason: z.string().nullable(),
});

export const myAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  onboardingCompletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
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
  name: z.string().min(1).max(100).openapi({ description: "User full name" }),
  email: z.string().email().openapi({ description: "User email address" }),
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
  name: z.string().min(1).max(100).optional(),
  email: z.email().optional(),
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
  profile: myAccountSchema,
  notifications: z.object({
    unreadCount: z.number().int(),
  }),
});
