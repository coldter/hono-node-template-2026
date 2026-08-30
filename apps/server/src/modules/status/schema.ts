import { z } from "@hono/zod-openapi";

export const statusResponseSchema = z.object({
  status: z.literal("ok"),
});

export const readinessResponseSchema = z.object({
  checks: z.object({
    database: z.boolean(),
    redis: z
      .boolean()
      .nullable()
      .openapi({ description: "null when Redis is not configured" }),
  }),
  status: z.enum(["ok", "unavailable"]),
});
