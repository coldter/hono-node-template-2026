import { createRouteConfig } from "@/lib/route-config";
import { isPublicAccess } from "@/middlewares/guard/is-public-access";

import { readinessResponseSchema, statusResponseSchema } from "./schema";

const statusRoutes = {
  getReadiness: createRouteConfig({
    description:
      "Probes Postgres (and Redis when configured) with short timeouts; returns 503 when any dependency is unreachable",
    guard: isPublicAccess,
    method: "get",
    operationId: "getReadiness",
    path: "/ready",
    responses: {
      200: {
        content: {
          "application/json": { schema: readinessResponseSchema },
        },
        description: "All dependencies are reachable",
      },
      503: {
        content: {
          "application/json": { schema: readinessResponseSchema },
        },
        description: "One or more dependencies are unreachable",
      },
    },
    summary: "Dependency readiness check",
    tags: ["status"],
  }),
  getStatus: createRouteConfig({
    description: "Returns 200 OK if the server is reachable",
    guard: isPublicAccess,
    method: "get",
    operationId: "getStatus",
    path: "/",
    responses: {
      200: {
        content: {
          "application/json": { schema: statusResponseSchema },
        },
        description: "Server is reachable",
      },
    },
    summary: "Server reachability check",
    tags: ["status"],
  }),
} as const;

export default statusRoutes;
