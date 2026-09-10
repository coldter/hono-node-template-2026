import { z } from "@hono/zod-openapi";

export const roleSchema = z.object({
  description: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const listRolesResponseSchema = z.object({
  roles: z.array(roleSchema),
});
