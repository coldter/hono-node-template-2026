import {
  buildEnrollRoutes,
  type EnrollRoutesDeps,
} from "@/modules/enroll/routes";
import {
  buildTenantsRoutes,
  type TenantsRoutesDeps,
} from "@/modules/tenants/routes";
import baseApp from "@/server";

/**
 * Admin-server router tree. DB-touching routers mount via `mountAppRoutes`
 * so tests can compose the surface with a stub DB/invalidator without
 * booting the real factories.
 */
export const app = baseApp;

export type AppDeps = Readonly<{
  tenants: TenantsRoutesDeps;
  enroll: EnrollRoutesDeps;
}>;

/**
 * Mount DB-backed routers onto `baseApp` with caller-supplied deps. The
 * function returns `baseApp` after side-effecting the mounts; production
 * boot wires the deps once in `index.ts`. Tests use this to mount the
 * tenants router against a stub DB.
 */
export function mountAppRoutes(deps: AppDeps): typeof baseApp {
  const tenants = buildTenantsRoutes(deps.tenants);
  baseApp.route("/api/admin/orgs", tenants);
  const enroll = buildEnrollRoutes(deps.enroll);
  baseApp.route("/api/admin/operator-enroll", enroll);
  return baseApp;
}
