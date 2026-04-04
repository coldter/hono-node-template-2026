import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";
import { listRolesResponseSchema } from "./schema";

const rolesRoutes = {
  listRoles: createRouteConfig({
    operationId: "listRoles",
    method: "get",
    path: "/",
    guard: [authorize("role", "list")],
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
