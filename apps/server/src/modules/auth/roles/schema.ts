import { z } from "@hono/zod-openapi";

import { PERMISSION_KEYS } from "./constants";

export const roleSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.enum(PERMISSION_KEYS)),
});

export const listRolesResponseSchema = z.object({
  roles: z.array(roleSchema),
});
