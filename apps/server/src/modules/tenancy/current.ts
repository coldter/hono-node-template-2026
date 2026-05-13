/**
 * `/api/tenancy/current`
 *
 * Returns the resolved tenant + branding payload the web app needs to render
 * the login screen, header, and theme before the user is authenticated.
 *
 * Tenancy:
 *   `requestContext.tenant` is populated by the chain (tenantMiddleware
 *   `onResolve` write-callback). Unknown hosts produce a 404 BEFORE this
 *   handler runs. Inside the handler we still guard for `null`
 *   defensively — when tenancy is bypassed in tests, the tenant may be
 *   missing.
 *
 * Branding:
 *   Read from `tenant.branding` (projected by `resolveTenant` at the
 *   tenancy package). No per-request DB query — branding mutations bump
 *   `Invalidator.bumpDurable` so cached projections are invalidated.
 */

import { OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { createRouteConfig } from "@/lib/route-config";
import { isPublicAccess } from "@/middlewares/guard/is-public-access";
import { defaultHook } from "@/utils/default-hook";

const brandingSchema = z.object({
  logoVersion: z.number().int().nonnegative(),
  primaryColor: z.string(),
  appName: z.string(),
});

const currentTenancyResponseSchema = z.object({
  organizationId: z.string(),
  slug: z.string().nullable(),
  host: z.string(),
  kind: z.enum(["subdomain", "custom"]),
  enforceSSO: z.boolean(),
  branding: brandingSchema,
  logoUrl: z.string().nullable(),
});

const getCurrentTenancyRoute = createRouteConfig({
  operationId: "getCurrentTenancy",
  method: "get",
  path: "/",
  guard: isPublicAccess,
  tags: ["tenancy"],
  summary: "Resolve the current tenant for the request host",
  description:
    "Returns the tenant id, host, kind, SSO enforcement flag, and branding payload used to bootstrap the web app before authentication.",
  responses: {
    200: {
      description: "Tenant resolved for the current request host",
      content: {
        "application/json": { schema: currentTenancyResponseSchema },
      },
    },
    404: {
      description: "No tenant resolved for the current request host",
    },
  },
});

const app = new OpenAPIHono<Env>({ defaultHook });

const currentTenancyRouter = app.openapi(getCurrentTenancyRoute, async (c) => {
  const tenant = c.var.requestContext.tenant;
  if (!tenant) {
    throw new HTTPException(404, { message: "Not Found" });
  }

  const { branding } = tenant;
  const logoUrl =
    branding.logoVersion > 0
      ? `https://${env.BRANDING_HOST}/${tenant.organizationId}/logo.${branding.logoVersion}.webp`
      : null;

  return c.json(
    {
      organizationId: tenant.organizationId,
      slug: tenant.slug,
      host: tenant.host,
      kind: tenant.kind,
      enforceSSO: tenant.enforceSSO,
      branding,
      logoUrl,
    },
    200
  );
});

export default currentTenancyRouter;
