// Hono middleware adapter for @repo/authorization
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RegistryInstance } from "./registry";
import type { AnyResourceDef } from "./schema";
import type { Principal } from "./types";

const AUTHORIZED_RESOURCE_KEY = "authorizedResource";

export interface CreateAuthorizeOptions<
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> {
  resolveDb?: (c: Context<TEnv>) => unknown;
  resolvePrincipal: (c: Context<TEnv>) => Principal | null | undefined;
}

export interface AuthorizeOptions {
  loadResource?: (c: Context) => Promise<unknown>;
  resolveRelation?: (
    subjectType: string,
    subjectId: string,
    relation: string,
    objectType: string,
    objectId: string
  ) => Promise<boolean>;
}

export interface AuthorizeFunction<
  TResources extends Record<string, AnyResourceDef> = Record<
    string,
    AnyResourceDef
  >,
> {
  skip: (label: string) => MiddlewareHandler;
  <K extends keyof TResources & string>(
    resource: K,
    action: string,
    opts?: AuthorizeOptions
  ): MiddlewareHandler;
}

export function createAuthorize<
  TResources extends Record<string, AnyResourceDef>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
>(
  registry: RegistryInstance<TResources>,
  options: CreateAuthorizeOptions<TEnv>
): AuthorizeFunction<TResources> {
  const authorizeImpl = (
    resource: string,
    action: string,
    opts?: AuthorizeOptions
  ): MiddlewareHandler => {
    return async (c, next) => {
      try {
        const principal = options.resolvePrincipal(c as Context<TEnv>);

        let loadedResource: unknown;
        if (opts?.loadResource) {
          loadedResource = await opts.loadResource(c);
          if (loadedResource === null || loadedResource === undefined) {
            throw new HTTPException(403, {
              message: "Forbidden",
              res: new Response(
                JSON.stringify({
                  error: { code: "RESOURCE_NOT_FOUND", message: "Forbidden" },
                }),
                { status: 403, headers: { "Content-Type": "application/json" } }
              ),
            });
          }
        }

        const decision = await registry.can(principal, resource, action, {
          resource: loadedResource,
          resolveRelation: opts?.resolveRelation,
        });

        if (!decision.allowed) {
          const status = decision.reason === "UNAUTHENTICATED" ? 401 : 403;
          const message = status === 401 ? "Unauthorized" : "Forbidden";
          const code = status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
          throw new HTTPException(status, {
            message,
            res: new Response(JSON.stringify({ error: { code, message } }), {
              status,
              headers: { "Content-Type": "application/json" },
            }),
          });
        }

        // Store loaded resource in context for downstream handlers
        if (loadedResource !== undefined) {
          c.set(AUTHORIZED_RESOURCE_KEY, loadedResource);
        }

        await next();
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        // Fail-closed: any unexpected error -> 403
        throw new HTTPException(403, {
          message: "Forbidden",
          res: new Response(
            JSON.stringify({
              error: { code: "FORBIDDEN", message: "Forbidden" },
            }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          ),
        });
      }
    };
  };

  const authorize = authorizeImpl as AuthorizeFunction<TResources>;

  authorize.skip = (_label: string): MiddlewareHandler => {
    return async (_c, next) => {
      // Intentionally unprotected route.
      await next();
    };
  };

  return authorize;
}

/**
 * Retrieve the resource loaded by authorize() middleware.
 */
export function getAuthorizedResource<T>(c: Context): T {
  return c.get(AUTHORIZED_RESOURCE_KEY) as T;
}

/**
 * Hono-specific helper that throws HTTPException(403) on deny.
 * For use in handlers when you need to check authorization after the middleware.
 */
export async function assertCanOrThrow<
  TResources extends Record<string, AnyResourceDef>,
>(
  registry: RegistryInstance<TResources>,
  principal: Principal | null | undefined,
  resource: keyof TResources & string,
  action: string,
  opts?: { resource?: unknown }
): Promise<void> {
  const decision = await registry.can(principal, resource, action, opts);
  if (!decision.allowed) {
    const status = decision.reason === "UNAUTHENTICATED" ? 401 : 403;
    const message = status === 401 ? "Unauthorized" : "Forbidden";
    const code = status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
    throw new HTTPException(status, {
      message,
      res: new Response(JSON.stringify({ error: { code, message } }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    });
  }
}
