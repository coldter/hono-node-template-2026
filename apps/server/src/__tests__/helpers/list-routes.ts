/**
 * `listRegisteredRoutes(app)` — small introspection helper that returns the
 * `{ method, path }` pairs registered directly on an OpenAPIHono / Hono app.
 *
 * Used by route-audit tests (e.g. `sso-callback-routing.test.ts`) to assert
 * that we have NOT accidentally registered duplicate or alias paths at the
 * top-level Hono mount.
 *
 * Limitation: routes registered INSIDE a sub-handler that the Hono app
 * forwards to (for example, the Better Auth plugin's own internal Hono
 * instance reached via `baseApp.all("/api/auth/*", authProxyMiddleware)`)
 * will NOT appear here. Tests that need to audit plugin-managed routes must
 * probe `auth.handler` directly. See the dual-level audit doc in
 * `sso-callback-routing.test.ts` for the canonical pattern.
 */

import type { Hono } from "hono";

export type RegisteredRoute = Readonly<{ method: string; path: string }>;

// boundary: Hono exposes `routes` as a public field on the app instance but
// the type is internal to Hono and shapes shift across minor versions. We
// narrow to the `{ method, path }` slice we actually need, which is stable.
type HonoLike = Hono & {
  readonly routes: ReadonlyArray<{ method: string; path: string }>;
};

export function listRegisteredRoutes(
  // boundary: Hono's `Hono<E>` is invariant in `E` (its `Variables`/`Bindings`
  // generics). Tests instantiate the app with `Env`, but the helper does not
  // care about the generic — we widen via the structural `HonoLike` shape so
  // the helper is reusable across Env variants.
  app: unknown
): RegisteredRoute[] {
  const candidate = app as HonoLike;
  if (!Array.isArray(candidate.routes)) {
    throw new Error(
      "listRegisteredRoutes: expected `app.routes` to be an array; got " +
        typeof candidate.routes
    );
  }
  return candidate.routes.map((r) => ({ method: r.method, path: r.path }));
}
