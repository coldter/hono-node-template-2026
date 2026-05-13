import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";

import {
  createUserBodySchema,
  createUserResponseSchema,
  deactivateUserBodySchema,
  getMyAccountResponseSchema,
  getUserResponseSchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
  successResponseSchema,
  updateUserBodySchema,
  updateUserResponseSchema,
  updateUserRolesBodySchema,
  userParamsSchema,
} from "./schema";
import { userService } from "./service";

const usersRoutes = {
  listUsers: createRouteConfig({
    operationId: "listUsers",
    method: "get",
    path: "/",
    guard: [authorize("user", "list")],
    tags: ["users"],
    summary: "List users",
    description: "Returns a paginated list of users with optional filters",
    request: { query: listUsersQuerySchema },
    responses: {
      200: {
        description: "Users list",
        content: { "application/json": { schema: listUsersResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  getMyAccount: createRouteConfig({
    operationId: "getMyAccount",
    method: "get",
    path: "/me",
    guard: [
      authorize("user", "view", {
        loadResource: async (c) => {
          const user = c.var.requestContext.principal?.user;
          if (!user) {
            return null;
          }
          return userService.findById(user.id);
        },
      }),
    ],
    tags: ["users"],
    summary: "Get my profile summary",
    description: "Returns user-facing profile info and notification summary",
    responses: {
      200: {
        description: "Current user account",
        content: { "application/json": { schema: getMyAccountResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  getUser: createRouteConfig({
    operationId: "getUser",
    method: "get",
    path: "/{userId}",
    guard: [
      authorize("user", "view", {
        loadResource: async (c) => {
          const userId = c.req.param("userId");
          if (!userId) {
            return null;
          }
          return userService.findById(userId);
        },
      }),
    ],
    tags: ["users"],
    summary: "Get user by ID",
    description: "Returns detailed user information",
    request: { params: userParamsSchema },
    responses: {
      200: {
        description: "User details",
        content: { "application/json": { schema: getUserResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  createUser: createRouteConfig({
    operationId: "createUser",
    method: "post",
    path: "/",
    guard: [authorize("user", "create")],
    tags: ["users"],
    summary: "Create user",
    description: "Creates a new user with the specified details",
    request: {
      body: {
        content: { "application/json": { schema: createUserBodySchema } },
      },
    },
    responses: {
      201: {
        description: "User created",
        content: { "application/json": { schema: createUserResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  updateUser: createRouteConfig({
    operationId: "updateUser",
    method: "patch",
    path: "/{userId}",
    guard: [
      authorize("user", "update", {
        loadResource: async (c) => {
          const userId = c.req.param("userId");
          if (!userId) {
            return null;
          }
          return userService.findById(userId);
        },
      }),
    ],
    tags: ["users"],
    summary: "Update user",
    description: "Updates user profile information",
    request: {
      params: userParamsSchema,
      body: {
        content: { "application/json": { schema: updateUserBodySchema } },
      },
    },
    responses: {
      200: {
        description: "User updated",
        content: { "application/json": { schema: updateUserResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  updateUserRoles: createRouteConfig({
    operationId: "updateUserRoles",
    method: "patch",
    path: "/{userId}/roles",
    guard: [authorize("user", "update")],
    tags: ["users"],
    summary: "Update user roles",
    description: "Updates user role assignments",
    request: {
      params: userParamsSchema,
      body: {
        content: { "application/json": { schema: updateUserRolesBodySchema } },
      },
    },
    responses: {
      200: {
        description: "Roles updated",
        content: { "application/json": { schema: updateUserResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  deactivateUser: createRouteConfig({
    operationId: "deactivateUser",
    method: "post",
    path: "/{userId}/deactivate",
    guard: [
      authorize("user", "deactivate", {
        loadResource: async (c) => {
          const userId = c.req.param("userId");
          if (!userId) {
            return null;
          }
          return userService.findById(userId);
        },
      }),
    ],
    tags: ["users"],
    summary: "Deactivate user",
    description: "Deactivates a user and revokes all sessions",
    request: {
      params: userParamsSchema,
      body: {
        content: { "application/json": { schema: deactivateUserBodySchema } },
      },
    },
    responses: {
      200: {
        description: "User deactivated",
        content: { "application/json": { schema: successResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  activateUser: createRouteConfig({
    operationId: "activateUser",
    method: "post",
    path: "/{userId}/activate",
    guard: [authorize("user", "activate")],
    tags: ["users"],
    summary: "Activate user",
    description: "Reactivates a deactivated user",
    request: { params: userParamsSchema },
    responses: {
      200: {
        description: "User activated",
        content: { "application/json": { schema: successResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),

  unlockUser: createRouteConfig({
    operationId: "unlockUser",
    method: "post",
    path: "/{userId}/unlock",
    guard: [authorize("user", "unlock")],
    tags: ["users"],
    summary: "Unlock user",
    description: "Unlocks a locked user and resets failed login attempts",
    request: { params: userParamsSchema },
    responses: {
      200: {
        description: "User unlocked",
        content: { "application/json": { schema: successResponseSchema } },
      },
      ...commonErrorResponses,
    },
  }),
} as const;

export default usersRoutes;
