import { commonErrorResponses } from "@/lib/common-resonse";
import { createRouteConfig } from "@/lib/route-config";
import { requirePermission } from "@/middlewares/guard";
import { PERMISSIONS } from "./permissions";
import { listRolesResponseSchema } from "./schema";

const rolesRoutes = {
  listRoles: createRouteConfig({
    operationId: "listRoles",
    method: "get",
    path: "/",
    guard: [requirePermission(PERMISSIONS.ROLES.VIEW)],
    tags: ["roles"],
    summary: "List all roles",
    description: "Returns a list of all system roles",
    responses: {
      200: {
        description: "Roles",
        content: {
          "application/json": {
            schema: listRolesResponseSchema,
          },
        },
      },
      ...commonErrorResponses,
    },
  }),
} as const;

export default rolesRoutes;
