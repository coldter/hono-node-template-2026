import { OpenAPIHono } from "@hono/zod-openapi";
import { roles } from "@repo/db/schema";
import { isNull } from "drizzle-orm";

import { db } from "@/db";
import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";

import rolesRoutes from "./routes";

const app = new OpenAPIHono<Env>({ defaultHook });

const rolesHandler = app.openapi(rolesRoutes.listRoles, async (c) => {
  const rolesData = await db
    .select({
      description: roles.description,
      name: roles.name,
      slug: roles.slug,
    })
    .from(roles)
    .where(isNull(roles.deletedAt));

  return c.json(
    {
      roles: rolesData.map((role) => ({
        description: role.description ?? "",
        name: role.name,
        slug: role.slug,
      })),
    },
    200
  );
});

export default rolesHandler;
