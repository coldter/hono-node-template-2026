import { z } from "@hono/zod-openapi";

import { PERMISSION_KEYS } from "./constants";

export const roleSchema = z.object({
  description: z.string(),
  name: z.string(),
  permissions: z.array(z.enum(PERMISSION_KEYS)),
  slug: z.string(),
});

export const listRolesResponseSchema = z.object({
  roles: z.array(roleSchema),
});
