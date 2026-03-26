import { createRoute } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import type { NonEmptyTuple } from "type-fest";

export type RouteOptions = Parameters<typeof createRoute>[0] & {
  guard: MiddlewareHandler | NonEmptyTuple<MiddlewareHandler>;
};

export type Route<
  P extends string,
  R extends Omit<RouteOptions, "path"> & {
    path: P;
  },
> = ReturnType<typeof createRoute<P, Omit<R, "guard">>>;

export const createRouteConfig = <
  P extends string,
  R extends Omit<RouteOptions, "path"> & {
    path: P;
  },
>({
  guard,
  ...routeConfig
}: R): Route<P, R> => {
  const initGuard = Array.isArray(guard) ? guard : [guard];
  let initMiddleware: MiddlewareHandler[] = [];
  if (routeConfig.middleware) {
    if (Array.isArray(routeConfig.middleware)) {
      initMiddleware = routeConfig.middleware;
    } else {
      initMiddleware = [routeConfig.middleware];
    }
  }
  const middleware = [...initGuard, ...initMiddleware];

  return createRoute({
    ...routeConfig,
    middleware,
  });
};
