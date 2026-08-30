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
      description: roles.description,
      name: roles.name,
      permissions: roles.permissions,
      slug: roles.slug,
    })
    .from(roles)
    .where(isNull(roles.deletedAt));

  return c.json(
    {
      roles: rolesData.map((role) => ({
        description: role.description ?? "",
        name: role.name,
        permissions: isAuthorizationRole(role.slug)
          ? getLegacyPermissionKeysForRole(role.slug)
          : role.permissions.filter(isLegacyPermissionKey),
        slug: role.slug,
      })),
    },
    200
  );
});

export default rolesHandler;
