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

// UNAUTHENTICATED surfaces as 401; every other deny collapses to a uniform
// FORBIDDEN body so the wire hides the reason (resource-existence side
// channel). Server logs can still distinguish via `decision.reason`.
function denyResponse(
  decisionOrReason: PolicyDecision | DenyReason
): HTTPException {
  const reason = denyReasonOf(decisionOrReason);
  const status = reason === "UNAUTHENTICATED" ? 401 : 403;
  const message = status === 401 ? "Unauthorized" : "Forbidden";
  const code = status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
  return new HTTPException(status, {
    message,
    res: new Response(JSON.stringify({ error: { code, message } }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  });
}

export interface CreateAuthorizeOptions<
  TEnv extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Whitelist of labels that may be passed to `unsafeBypassAuthorization`.
   * Any other label throws at middleware-construction time so unreviewed
   * bypasses cannot reach a deployment. Empty/undefined means no labels
   * are allowed and any bypass call throws.
   */
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
  /**
   * Mark a route as intentionally not authorized. Construction-time guard
   * rejects labels not in `allowedBypassLabels`; each invocation logs a
   * structured `authorization.bypass` warning so production usage is loud.
   */
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
    <K extends keyof TResources & string>(
      resource: K,
      action: ActionsOf<TResources[K]>,
      opts?: AuthorizeOptions<ResourceTypeFor<TResources[K]>>
    ): MiddlewareHandler =>
    async (c, next) => {
      const principal = options.resolvePrincipal(c as Context<TEnv>);

      let loadedResource: ResourceTypeFor<TResources[K]> | undefined;
      if (opts?.loadResource) {
        const loaded = await opts.loadResource(c);
        if (loaded === null || loaded === undefined) {
          throw denyResponse("RESOURCE_NOT_FOUND");
        }
        loadedResource = loaded;
      }

      const decision = await registry.can(principal, resource, action, {
        resource: loadedResource,
        resolveRelation: opts?.resolveRelation,
      });

      if (!decision.allowed) {
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
      // Loud signal: production logs/metrics MUST be able to spot bypassed
      // routes. Package is dep-free; consumers can intercept stdout or
      // wrap console for structured logging.
      console.warn(
        JSON.stringify({
          event: "authorization.bypass",
          label,
          path: c.req.path,
          method: c.req.method,
        })
      );
      await next();
    };
  };

  const authorize: AuthorizeFunction<TResources> = Object.assign(
    authorizeImpl,
    { unsafeBypassAuthorization }
  ) satisfies AuthorizeFunction<TResources>;

  return authorize;
}

/**
 * Retrieve the resource loaded by authorize() middleware. Throws if the
 * route's middleware did not declare a `loadResource` — handlers can
 * rely on a non-null `T` instead of casting from `undefined`.
 */
export function getAuthorizedResource<T>(c: Context): T {
  const value = c.get(AUTHORIZED_RESOURCE_KEY);
  if (value === undefined || value === null) {
    throw new Error(
      "getAuthorizedResource() called but no resource was loaded. " +
        "Ensure the route's authorize(...) middleware passes `loadResource`."
    );
  }
  // boundary: caller declares T; runtime value came from loadResource whose
  // return was constrained to TResource at the middleware site.
  return value as T;
}

/**
 * Throws HTTPException(403) on deny. Use in handlers when authorization
 * must be re-checked after the middleware (e.g. resource loaded later).
 */
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
