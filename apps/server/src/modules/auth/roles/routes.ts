import { authorize } from "@/auth/middleware";
import { commonErrorResponses } from "@/lib/common-response";
import { createRouteConfig } from "@/lib/route-config";
import { listRolesResponseSchema } from "./schema";

const rolesRoutes = {
  listRoles: createRouteConfig({
    description: "Returns a list of all system roles",
    guard: [authorize("role", "list")],
    method: "get",
    operationId: "listRoles",
    path: "/",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: listRolesResponseSchema,
          },
        },
        description: "Roles",
      },
      ...commonErrorResponses,
    },
    summary: "List all roles",
    tags: ["roles"],
  }),
} as const;

export default rolesRoutes;
