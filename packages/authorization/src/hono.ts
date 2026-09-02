import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RegistryInstance } from "./registry";
import type { ActionsOf, ResourceTypeFor } from "./resource";
import type { AnyResourceDef } from "./schema";
import type { DenyReason, PolicyDecision, Principal } from "./types";

const AUTHORIZED_RESOURCE_KEY = "authorizedResource";

function denyReasonOf(input: PolicyDecision | DenyReason): DenyReason {
  if (typeof input === "string") {
    return input;
  }
  if (input.allowed === false) {
    return input.reason;
  }
  return "NO_MATCHING_POLICY";
}

function denyStatus(reason: DenyReason): 401 | 403 | 404 {
  if (reason === "UNAUTHENTICATED") {
    return 401;
  }
  if (reason === "RESOURCE_NOT_FOUND") {
    return 404;
  }
  return 403;
}

function denyMessage(status: 401 | 403 | 404): string {
  if (status === 401) {
    return "Unauthorized";
  }
  if (status === 404) {
    return "Not Found";
  }
  return "Forbidden";
}

function denyCode(status: 401 | 403 | 404): string {
  if (status === 401) {
    return "UNAUTHORIZED";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  return "FORBIDDEN";
}

function denyResponse(
  decisionOrReason: PolicyDecision | DenyReason
): HTTPException {
  const reason = denyReasonOf(decisionOrReason);
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

export interface CreateAuthorizeOptions<
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> {
  allowedBypassLabels?: readonly string[];
  resolveDb?: (c: Context<TEnv>) => unknown;
  resolvePrincipal: (c: Context<TEnv>) => Principal | null | undefined;
}

export interface AuthorizeOptions<TResource = unknown> {
  loadResource?: (c: Context) => Promise<TResource | null>;
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
  unsafeBypassAuthorization: (label: string) => MiddlewareHandler;
  <K extends keyof TResources & string>(
    resource: K,
    action: ActionsOf<TResources[K]>,
    opts?: AuthorizeOptions<ResourceTypeFor<TResources[K]>>
  ): MiddlewareHandler;
}

export function createAuthorize<
  TResources extends Record<string, AnyResourceDef>,
  TEnv extends Record<string, unknown> = Record<string, unknown>,
>(
  registry: RegistryInstance<TResources>,
  options: CreateAuthorizeOptions<TEnv>
): AuthorizeFunction<TResources> {
  const allowedBypass = new Set(options.allowedBypassLabels ?? []);

  const authorizeImpl =
    (
      resource: string,
      action: string,
      opts?: AuthorizeOptions
    ): MiddlewareHandler =>
    async (c, next) => {
      const principal = options.resolvePrincipal(c as Context<TEnv>);

      let loadedResource: unknown;
      if (opts?.loadResource) {
        loadedResource = await opts.loadResource(c);
        if (loadedResource === null || loadedResource === undefined) {
          const globalDecision = await registry.can(
            principal,
            resource,

            action as never,
            {
              resolveRelation: opts?.resolveRelation,
            }
          );

          if (globalDecision.allowed) {
            throw denyResponse("RESOURCE_NOT_FOUND");
          }

          throw denyResponse("NO_MATCHING_POLICY");
        }
      }

      const decision = await registry.can(
        principal,
        resource,

        action as never,
        {
          resolveRelation: opts?.resolveRelation,
          resource: loadedResource,
        }
      );

      if (!decision.allowed) {
        if (decision.reason === "EVALUATION_ERROR") {
          console.error(
            JSON.stringify({
              action,
              cause:
                decision.cause instanceof Error
                  ? decision.cause.message
                  : String(decision.cause ?? "unknown"),
              event: "authorization.evaluation_error",
              path: c.req.path,
            })
          );
        }
        throw denyResponse(decision);
      }

      if (loadedResource !== undefined) {
        c.set(AUTHORIZED_RESOURCE_KEY, loadedResource);
      }

      await next();
    };

  const unsafeBypassAuthorization = (label: string): MiddlewareHandler => {
    if (!allowedBypass.has(label)) {
      throw new Error(
        `unsafeBypassAuthorization("${label}") is not in allowedBypassLabels. ` +
          `Add "${label}" to createAuthorize({ allowedBypassLabels }) ` +
          "to opt this route out of authorization."
      );
    }
    return async (c, next) => {
      console.warn(
        JSON.stringify({
          event: "authorization.bypass",
          label,
          method: c.req.method,
          path: c.req.path,
        })
      );
      await next();
    };
  };

  const authorize = Object.assign(authorizeImpl, {
    unsafeBypassAuthorization,
  }) as unknown as AuthorizeFunction<TResources>;

  return authorize;
}

export function getAuthorizedResource<T>(c: Context): T {
  const value = c.get(AUTHORIZED_RESOURCE_KEY);
  if (value === undefined || value === null) {
    throw new Error(
      "getAuthorizedResource() called but no resource was loaded. " +
        "Ensure the route's authorize(...) middleware passes `loadResource`."
    );
  }

  return value as T;
}

export async function assertCanOrThrow<
  TResources extends Record<string, AnyResourceDef>,
  K extends keyof TResources & string,
>(
  registry: RegistryInstance<TResources>,
  principal: Principal | null | undefined,
  resource: K,
  action: ActionsOf<TResources[K]>,
  opts?: { resource?: unknown }
): Promise<void> {
  const decision = await registry.can(principal, resource, action, opts);
  if (!decision.allowed) {
    throw denyResponse(decision);
  }
}
