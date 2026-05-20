import type { Context } from "hono";
import type { Tenant } from "./types";

export function useTenant(c: Context): Tenant {
  // boundary: hono context getter widens unset vars to undefined
  const tenant = c.get("tenant") as Tenant | undefined;
  if (!tenant) {
    throw new Error(
      "useTenant called without tenantMiddleware in the chain; mount tenantMiddleware on this route or use useTenantMaybe"
    );
  }
  return tenant;
}

export function useTenantMaybe(c: Context): Tenant | null {
  // boundary: hono context getter widens unset vars to undefined
  const tenant = c.get("tenant") as Tenant | undefined;
  return tenant ?? null;
}
