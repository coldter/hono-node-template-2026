import { createRouteConfig } from "@/lib/route-config";
import { isPublicAccess } from "@/middlewares/guard/is-public-access";

import { readinessResponseSchema, statusResponseSchema } from "./schema";

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
  getReadiness: createRouteConfig({
    operationId: "getReadiness",
    method: "get",
    path: "/ready",
    guard: isPublicAccess,
    tags: ["status"],
    summary: "Dependency readiness check",
    description:
      "Probes Postgres (and Redis when configured) with short timeouts; returns 503 when any dependency is unreachable",
    responses: {
      200: {
        description: "All dependencies are reachable",
        content: {
          "application/json": { schema: readinessResponseSchema },
        },
      },
      503: {
        description: "One or more dependencies are unreachable",
        content: {
          "application/json": { schema: readinessResponseSchema },
        },
      },
    },
  }),
} as const;

export default statusRoutes;
