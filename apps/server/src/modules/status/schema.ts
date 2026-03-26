import { z } from "@hono/zod-openapi";

export const statusResponseSchema = z.object({
  status: z.literal("ok"),
});
