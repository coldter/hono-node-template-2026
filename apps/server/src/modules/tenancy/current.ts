import { OpenAPIHono, z } from "@hono/zod-openapi";
import { useTenant } from "@repo/tenancy";
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
  const tenant = useTenant(c);

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
