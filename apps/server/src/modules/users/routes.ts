import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";
import { loadUserResource } from "./auth-loader";
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

const usersRoutes = {
  activateUser: createRouteConfig({
    description: "Reactivates a deactivated user",
    guard: [authorize("user", "activate", { loadResource: loadUserResource })],
    method: "post",
    operationId: "activateUser",
    path: "/{userId}/activate",
    request: { params: userParamsSchema },
    responses: {
      200: {
        content: { "application/json": { schema: successResponseSchema } },
        description: "User activated",
      },
      ...commonErrorResponses,
    },
    summary: "Activate user",
    tags: ["users"],
  }),

  createUser: createRouteConfig({
    description: "Creates a new user with the specified details",
    guard: [authorize("user", "create")],
    method: "post",
    operationId: "createUser",
    path: "/",
    request: {
      body: {
        content: { "application/json": { schema: createUserBodySchema } },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: createUserResponseSchema } },
        description: "User created",
      },
      ...commonErrorResponses,
    },
    summary: "Create user",
    tags: ["users"],
  }),

  deactivateUser: createRouteConfig({
    description: "Deactivates a user and revokes all sessions",
    guard: [
      authorize("user", "deactivate", { loadResource: loadUserResource }),
    ],
    method: "post",
    operationId: "deactivateUser",
    path: "/{userId}/deactivate",
    request: {
      body: {
        content: { "application/json": { schema: deactivateUserBodySchema } },
      },
      params: userParamsSchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: successResponseSchema } },
        description: "User deactivated",
      },
      ...commonErrorResponses,
    },
    summary: "Deactivate user",
    tags: ["users"],
  }),

  getMyAccount: createRouteConfig({
    description: "Returns user-facing profile info and notification summary",
    guard: [authorize("user", "view")],
    method: "get",
    operationId: "getMyAccount",
    path: "/me",
    responses: {
      200: {
        content: { "application/json": { schema: getMyAccountResponseSchema } },
        description: "Current user account",
      },
      ...commonErrorResponses,
    },
    summary: "Get my profile summary",
    tags: ["users"],
  }),

  getUser: createRouteConfig({
    description: "Returns detailed user information",
    guard: [authorize("user", "view", { loadResource: loadUserResource })],
    method: "get",
    operationId: "getUser",
    path: "/{userId}",
    request: { params: userParamsSchema },
    responses: {
      200: {
        content: { "application/json": { schema: getUserResponseSchema } },
        description: "User details",
      },
      ...commonErrorResponses,
    },
    summary: "Get user by ID",
    tags: ["users"],
  }),
  listUsers: createRouteConfig({
    description: "Returns a paginated list of users with optional filters",
    guard: [authorize("user", "list")],
    method: "get",
    operationId: "listUsers",
    path: "/",
    request: { query: listUsersQuerySchema },
    responses: {
      200: {
        content: { "application/json": { schema: listUsersResponseSchema } },
        description: "Users list",
      },
      ...commonErrorResponses,
    },
    summary: "List users",
    tags: ["users"],
  }),

  unlockUser: createRouteConfig({
    description: "Unlocks a locked user and resets failed login attempts",
    guard: [authorize("user", "unlock", { loadResource: loadUserResource })],
    method: "post",
    operationId: "unlockUser",
    path: "/{userId}/unlock",
    request: { params: userParamsSchema },
    responses: {
      200: {
        content: { "application/json": { schema: successResponseSchema } },
        description: "User unlocked",
      },
      ...commonErrorResponses,
    },
    summary: "Unlock user",
    tags: ["users"],
  }),

  updateUser: createRouteConfig({
    description: "Updates user profile information",
    guard: [authorize("user", "update", { loadResource: loadUserResource })],
    method: "patch",
    operationId: "updateUser",
    path: "/{userId}",
    request: {
      body: {
        content: { "application/json": { schema: updateUserBodySchema } },
      },
      params: userParamsSchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: updateUserResponseSchema } },
        description: "User updated",
      },
      ...commonErrorResponses,
    },
    summary: "Update user",
    tags: ["users"],
  }),

  updateUserRoles: createRouteConfig({
    description: "Updates user role assignments",
    guard: [
      authorize("user", "assign-roles", { loadResource: loadUserResource }),
    ],
    method: "patch",
    operationId: "updateUserRoles",
    path: "/{userId}/roles",
    request: {
      body: {
        content: { "application/json": { schema: updateUserRolesBodySchema } },
      },
      params: userParamsSchema,
    },
    responses: {
      200: {
        content: { "application/json": { schema: updateUserResponseSchema } },
        description: "Roles updated",
      },
      ...commonErrorResponses,
    },
    summary: "Update user roles",
    tags: ["users"],
  }),
} as const;

export default usersRoutes;
