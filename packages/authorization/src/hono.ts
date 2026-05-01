// Hono middleware adapter for @repo/authorization
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { RegistryInstance } from "./registry";
import type { ActionsOf, ResourceTypeFor } from "./resource";
import type { AnyResourceDef } from "./schema";
import type { DenyReason, PolicyDecision, Principal } from "./types";

const AUTHORIZED_RESOURCE_KEY = "authorizedResource";

// Map a deny decision (or bare reason) to its DenyReason. Avoids nested
// ternaries in denyResponse so the lint rule against them is satisfied.
function denyReasonOf(input: PolicyDecision | DenyReason): DenyReason {
  if (typeof input === "string") {
    return input;
  }
  if (input.allowed === false) {
    return input.reason;
  }
  return "NO_MATCHING_POLICY";
}

// Build the HTTPException for any deny path in this adapter. UNAUTHENTICATED
// surfaces as 401; everything else collapses to a uniform FORBIDDEN body so
// the wire intentionally hides the specific deny reason (server logs may
// still distinguish via decision.reason).
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

  const authorizeImpl = (
    resource: string,
    action: string,
    opts?: AuthorizeOptions
  ): MiddlewareHandler => {
    return async (c, next) => {
      const principal = options.resolvePrincipal(c as Context<TEnv>);

      let loadedResource: unknown;
      if (opts?.loadResource) {
        loadedResource = await opts.loadResource(c);
        if (loadedResource === null || loadedResource === undefined) {
          // Uniform FORBIDDEN body avoids a resource-existence side channel
          // (server-side reasoning may still distinguish for logging).
          throw denyResponse("RESOURCE_NOT_FOUND");
        }
      }

      // boundary: registry.can carries a typed action union per resource;
      // the impl here is generic over `string` because the public callable
      // signature on AuthorizeFunction enforces the typed action -- the
      // narrowing happened at the call site in user code.
      const decision = await registry.can(
        principal,
        resource,
        action as never,
        {
          resource: loadedResource,
          resolveRelation: opts?.resolveRelation,
        }
      );

      if (!decision.allowed) {
        throw denyResponse(decision);
      }

      // Store loaded resource in context for downstream handlers
      if (loadedResource !== undefined) {
        c.set(AUTHORIZED_RESOURCE_KEY, loadedResource);
      }

      await next();
    };
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
      // routes. The package is dependency-free; consumers can intercept
      // stdout or wrap console if structured logging is required.
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

  // boundary: the public callable signature on AuthorizeFunction is more
  // strict than the impl (typed action union per resource). The impl widens
  // to `string` because narrowing happens at the call site in user code.
  const authorize = Object.assign(authorizeImpl, {
    unsafeBypassAuthorization,
  }) as unknown as AuthorizeFunction<TResources>;

  return authorize;
}

/**
 * Retrieve the resource loaded by authorize() middleware. Throws if the
 * caller invokes this on a route whose middleware did not declare a
 * `loadResource` (or whose loader produced a nullish value that the
 * middleware would have already converted to a 403). After the change,
 * downstream handlers can rely on a non-null `T` instead of casting from
 * `undefined`.
 */
export function getAuthorizedResource<T>(c: Context): T {
  const value = c.get(AUTHORIZED_RESOURCE_KEY);
  if (value === undefined || value === null) {
    throw new Error(
      "getAuthorizedResource() called but no resource was loaded. " +
        "Ensure the route's authorize(...) middleware passes `loadResource`."
    );
  }
  // boundary: caller declared T; runtime value originated from loadResource
  // whose return type was constrained to TResource at the middleware site.
  return value as T;
}

/**
 * Hono-specific helper that throws HTTPException(403) on deny.
 * For use in handlers when you need to check authorization after the middleware.
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
