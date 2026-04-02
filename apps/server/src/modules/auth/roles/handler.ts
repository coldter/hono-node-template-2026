import { OpenAPIHono } from "@hono/zod-openapi";
import { roles } from "@repo/db/schema";
import {
  getLegacyPermissionKeysForRole,
  isAuthorizationRole,
  isLegacyPermissionKey,
} from "@repo/shared/authorization";
import { isNull } from "drizzle-orm";

import { db } from "@/db";
import type { Env } from "@/lib/context";
import { defaultHook } from "@/utils/default-hook";

import rolesRoutes from "./routes";

const app = new OpenAPIHono<Env>({ defaultHook });

const rolesHandler = app.openapi(rolesRoutes.listRoles, async (c) => {
  const rolesData = await db
    .select({
      slug: roles.slug,
      name: roles.name,
      description: roles.description,
      permissions: roles.permissions,
    })
    .from(roles)
    .where(isNull(roles.deletedAt));

  return c.json(
    {
      roles: rolesData.map((role) => ({
        slug: role.slug,
        name: role.name,
        description: role.description ?? "",
        permissions: isAuthorizationRole(role.slug)
          ? getLegacyPermissionKeysForRole(role.slug)
          : role.permissions.filter(isLegacyPermissionKey),
      })),
    },
    200
  );
});

export default rolesHandler;
