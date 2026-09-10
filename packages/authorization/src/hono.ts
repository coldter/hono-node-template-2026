import type { Context, Env, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RegistryInstance } from "./registry";
import type { ActionsOf, ResourceTypeFor } from "./resource";
import type { AnyResourceDef } from "./schema";
import type { DenyReason, PolicyDecision, Principal } from "./types";

const AUTHORIZED_RESOURCE_KEY = "authorizedResource";

export const AUTHORIZATION_GUARD = Symbol("authorizationGuard");

export interface AuthorizationGuard {
  readonly [AUTHORIZATION_GUARD]?: true;
}

export function isAuthorizationGuard(
  middleware: unknown
): middleware is MiddlewareHandler & AuthorizationGuard {
  return (
    middleware instanceof Function &&
    Object.hasOwn(middleware, AUTHORIZATION_GUARD)
  );
}

function denyStatus(reason: DenyReason): 401 | 403 | 404 | 500 {
  if (reason === "UNAUTHENTICATED") {
    return 401;
  }
  if (reason === "RESOURCE_NOT_FOUND") {
    return 404;
  }
  if (reason === "EVALUATION_ERROR") {
    return 500;
  }
  return 403;
}

function denyMessage(status: 401 | 403 | 404 | 500): string {
  if (status === 401) {
    return "Unauthorized";
  }
  if (status === 404) {
    return "Not Found";
  }
  if (status === 500) {
    return "Internal Server Error";
  }
  return "Forbidden";
}

function denyCode(status: 401 | 403 | 404 | 500): string {
  if (status === 401) {
    return "UNAUTHORIZED";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 500) {
    return "INTERNAL_ERROR";
  }
  return "FORBIDDEN";
}

function denyResponse(reason: DenyReason): HTTPException {
  const status = denyStatus(reason);
  const message = denyMessage(status);
  const code = denyCode(status);
  return new HTTPException(status, {
    message,
    res: new Response(JSON.stringify({ error: { code, message } }), {
      headers: { "Content-Type": "application/json" },
      status,
    }),
  });
}

function logEvaluationError(
  decision: PolicyDecision,
  action: string,
  path: string
): void {
  if (decision.allowed || decision.reason !== "EVALUATION_ERROR") {
    return;
  }
  const causeInfo =
    decision.cause instanceof Error
      ? { message: decision.cause.message, name: decision.cause.name }
      : { value: String(decision.cause ?? "unknown") };
  console.error(
    JSON.stringify({
      action,
      cause: causeInfo,
      event: "authorization.evaluation_error",
      path,
    })
  );
}

export interface CreateAuthorizeOptions<TEnv extends Env = Env> {
  resolvePrincipal: (c: Context<TEnv>) => Principal | null | undefined;
}

export interface AuthorizeOptions<TResource = unknown> {
  loadResource?: (c: Context) => Promise<TResource | null | undefined>;
}

export type AuthorizeFunction<
  TResources extends Record<string, AnyResourceDef> = Record<
    string,
    AnyResourceDef
  >,
> = <K extends keyof TResources & string>(
  resource: K,
  action: ActionsOf<TResources[K]>,
  opts?: AuthorizeOptions<ResourceTypeFor<TResources[K]>>
) => MiddlewareHandler;

export function createAuthorize<
  TResources extends Record<string, AnyResourceDef>,
  TEnv extends Env = Env,
>(
  registry: RegistryInstance<TResources>,
  options: CreateAuthorizeOptions<TEnv>
): AuthorizeFunction<TResources> {
  function authorizeImpl<K extends keyof TResources & string>(
    resource: K,
    action: ActionsOf<TResources[K]>,
    opts?: AuthorizeOptions<ResourceTypeFor<TResources[K]>>
  ): MiddlewareHandler {
    const middleware: MiddlewareHandler = async (c, next) => {
      const principal = options.resolvePrincipal(c);

      let loadedResource: ResourceTypeFor<TResources[K]> | undefined;
      if (opts?.loadResource) {
        const loaded = await opts.loadResource(c);
        if (loaded === null || loaded === undefined) {
          const globalDecision = await registry.can(
            principal,
            resource,
            action
          );

          if (globalDecision.allowed) {
            throw denyResponse("RESOURCE_NOT_FOUND");
          }

          logEvaluationError(globalDecision, action, c.req.path);
          throw denyResponse(globalDecision.reason);
        }
        loadedResource = loaded;
      }

      const decision = await registry.can(principal, resource, action, {
        resource: loadedResource,
      });

      if (!decision.allowed) {
        logEvaluationError(decision, action, c.req.path);
        throw denyResponse(decision.reason);
      }

      if (loadedResource !== undefined) {
        c.set(AUTHORIZED_RESOURCE_KEY, loadedResource);
      }

      await next();
    };

    Object.defineProperty(middleware, AUTHORIZATION_GUARD, { value: true });

    return middleware;
  }

  return authorizeImpl;
}

export function getAuthorizedResource<T>(c: Context): T {
  const value = c.get(AUTHORIZED_RESOURCE_KEY);
  if (value === undefined || value === null) {
    throw new Error(
      "getAuthorizedResource() called but no resource was loaded. " +
        "Ensure the route's authorize(...) middleware passes `loadResource`."
    );
  }

  return value;
}
