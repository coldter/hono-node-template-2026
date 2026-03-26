import { createRouteConfig } from "@/lib/route-config";
import { isPublicAccess } from "@/middlewares/guard/is-public-access";

import { statusResponseSchema } from "./schema";

const statusRoutes = {
  getStatus: createRouteConfig({
    operationId: "getStatus",
    method: "get",
    path: "/",
    guard: isPublicAccess,
    tags: ["status"],
    summary: "Server reachability check",
    description: "Returns 200 OK if the server is reachable",
    responses: {
      200: {
        description: "Server is reachable",
        content: {
          "application/json": { schema: statusResponseSchema },
        },
      },
    },
  }),
} as const;

export default statusRoutes;
