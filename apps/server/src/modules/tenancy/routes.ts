/**
 * `/api/tenancy/hostnames` — custom-hostname HTTP routes.
 *
 * Authn / authz: `requestContext.tenant` must be set (else 404);
 * `requestContext.principal` must be authenticated (else 401); the session's
 * `activeOrganizationId` must match `tenant.organizationId` (else 403).
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { bumpTenantCacheVersion } from "@repo/db";
import type { TenantCustomHostname } from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "@/db";
import { env } from "@/env";
import { commonErrorResponses } from "@/lib/common-response";
import type { Env } from "@/lib/context";
import { createRouteConfig } from "@/lib/route-config";
import { isAuthenticated } from "@/middlewares/guard/is-authenticated";
import { isAuthenticated as isAuthenticatedPrincipal } from "@/modules/auth/principal";
import { defaultHook } from "@/utils/default-hook";
import {
  CustomHostnameError,
  type CustomHostnameErrorCode,
} from "./custom-hostname-errors";
import {
  type CustomHostnameService,
  customHostnameService,
} from "./custom-hostname-service";
import {
  type CustomHostnameRow,
  createCustomHostnameBodySchema,
  createCustomHostnameResponseSchema,
  customHostnameIdParamSchema,
  listCustomHostnamesResponseSchema,
} from "./schema";

export type CustomHostnameRoutesDeps = Readonly<{
  service: CustomHostnameService;
  /** Echoed back so the client knows where to point their CNAME. */
  cnameTarget: string;
  /** Echoed back so the client knows where to publish the TXT record. */
  txtLabel: string;
  /** Apex / wildcard host the API runs on — used to reject claims on it. */
  appWildcardHost: string;
}>;

function serializeRow(r: TenantCustomHostname): CustomHostnameRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    hostname: r.hostname,
    lifecycleStatus: r.lifecycleStatus,
    caddyCertStorageKey: r.caddyCertStorageKey,
    verificationToken: r.verificationToken,
    verificationVerifiedAt: r.verificationVerifiedAt
      ? r.verificationVerifiedAt.toISOString()
      : null,
    verificationErrors: r.verificationErrors,
    lastReconciledAt: r.lastReconciledAt
      ? r.lastReconciledAt.toISOString()
      : null,
    lastHandshakeAt: r.lastHandshakeAt ? r.lastHandshakeAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * Exhaustive mapping from typed service errors to HTTP. Adding a new code
 * to `CustomHostnameErrorCode` forces a compile error here until handled.
 */
function errorForCode(code: CustomHostnameErrorCode): {
  status: 400 | 404 | 409 | 429;
  errorCode: string;
} {
  // biome-ignore lint/style/useDefaultSwitchClause: exhaustive on the closed CustomHostnameErrorCode union; default would silence the type guard
  switch (code) {
    case "max_pending":
    case "rate_limit_24h":
      return { status: 429, errorCode: code.toUpperCase() };
    case "not_found":
      return { status: 404, errorCode: "NOT_FOUND" };
    case "duplicate_hostname":
      return { status: 409, errorCode: "DUPLICATE_HOSTNAME" };
    case "verify_no_record":
    case "verify_mismatch":
    case "verify_resolver_error":
      return { status: 400, errorCode: code.toUpperCase() };
    case "invalid_hostname":
      return { status: 400, errorCode: "INVALID_HOSTNAME" };
    case "invalid_transition":
      return { status: 409, errorCode: "INVALID_TRANSITION" };
  }
}

function throwForServiceError(err: unknown): never {
  if (err instanceof CustomHostnameError) {
    const { status, errorCode } = errorForCode(err.code);
    throw new HTTPException(status, {
      message: err.message,
      cause: { code: errorCode },
    });
  }
  if (err instanceof Error) {
    throw err;
  }
  throw new Error("unknown service error");
}

function requireTenantAndOrg(c: Context<Env>): { organizationId: string } {
  const { tenant, principal } = c.var.requestContext;
  if (!tenant) {
    throw new HTTPException(404, { message: "Not Found" });
  }
  if (!isAuthenticatedPrincipal(principal)) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  if (
    !principal.activeOrganizationId ||
    principal.activeOrganizationId !== tenant.organizationId
  ) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
  return { organizationId: tenant.organizationId };
}

const createHostnameRoute = createRouteConfig({
  operationId: "createCustomHostname",
  method: "post",
  path: "/",
  guard: isAuthenticated,
  tags: ["tenancy", "hostnames"],
  summary: "Request a new custom hostname for the active organization",
  request: {
    body: {
      content: {
        "application/json": { schema: createCustomHostnameBodySchema },
      },
    },
  },
  responses: {
    201: {
      description: "Custom hostname row created.",
      content: {
        "application/json": { schema: createCustomHostnameResponseSchema },
      },
    },
    ...commonErrorResponses,
  },
});

const listHostnamesRoute = createRouteConfig({
  operationId: "listCustomHostnames",
  method: "get",
  path: "/",
  guard: isAuthenticated as MiddlewareHandler,
  tags: ["tenancy", "hostnames"],
  summary: "List custom hostnames for the active organization",
  responses: {
    200: {
      description: "Hostnames owned by the active organization.",
      content: {
        "application/json": { schema: listCustomHostnamesResponseSchema },
      },
    },
    ...commonErrorResponses,
  },
});

const verifyHostnameRoute = createRouteConfig({
  operationId: "verifyCustomHostname",
  method: "post",
  path: "/{id}/verify-txt",
  guard: isAuthenticated as MiddlewareHandler,
  tags: ["tenancy", "hostnames"],
  summary: "Verify the TXT record for a pending custom hostname",
  request: { params: customHostnameIdParamSchema },
  responses: {
    200: {
      description: "Hostname row after a successful TXT verification.",
      content: {
        "application/json": { schema: createCustomHostnameResponseSchema },
      },
    },
    ...commonErrorResponses,
  },
});

const deleteHostnameRoute = createRouteConfig({
  operationId: "deleteCustomHostname",
  method: "delete",
  path: "/{id}",
  guard: isAuthenticated as MiddlewareHandler,
  tags: ["tenancy", "hostnames"],
  summary: "Soft-remove a custom hostname (transitions to `removing`)",
  request: { params: customHostnameIdParamSchema },
  responses: {
    200: {
      description: "Hostname row after the removing transition.",
      content: {
        "application/json": { schema: createCustomHostnameResponseSchema },
      },
    },
    ...commonErrorResponses,
  },
});

export function buildCustomHostnameRoutes(deps: CustomHostnameRoutesDeps) {
  const app = new OpenAPIHono<Env>({ defaultHook });

  return app
    .openapi(createHostnameRoute, async (c) => {
      const { organizationId } = requireTenantAndOrg(c);
      const body = c.req.valid("json");
      try {
        const out = await deps.service.request({
          orgId: organizationId,
          hostname: body.hostname.trim(),
          appWildcardHost: deps.appWildcardHost,
        });
        return c.json(
          {
            hostname: serializeRow(out.row),
            cnameTarget: deps.cnameTarget,
            txtLabel: deps.txtLabel,
          },
          201
        );
      } catch (err) {
        throwForServiceError(err);
      }
    })
    .openapi(listHostnamesRoute, async (c) => {
      const { organizationId } = requireTenantAndOrg(c);
      const rows = await deps.service.list(organizationId);
      return c.json({ hostnames: rows.map(serializeRow) }, 200);
    })
    .openapi(verifyHostnameRoute, async (c) => {
      const { organizationId } = requireTenantAndOrg(c);
      const { id } = c.req.valid("param");
      try {
        const row = await deps.service.verifyTxt({
          id,
          orgId: organizationId,
        });
        return c.json(
          {
            hostname: serializeRow(row),
            cnameTarget: deps.cnameTarget,
            txtLabel: deps.txtLabel,
          },
          200
        );
      } catch (err) {
        throwForServiceError(err);
      }
    })
    .openapi(deleteHostnameRoute, async (c) => {
      const { organizationId } = requireTenantAndOrg(c);
      const { id } = c.req.valid("param");
      try {
        const row = await deps.service.remove({
          id,
          orgId: organizationId,
        });
        return c.json(
          {
            hostname: serializeRow(row),
            cnameTarget: deps.cnameTarget,
            txtLabel: deps.txtLabel,
          },
          200
        );
      } catch (err) {
        throwForServiceError(err);
      }
    });
}

/**
 * Production-wired router. The no-op invalidator is replaced by the
 * Hatchet fan-out invalidator in the worker process; HTTP-initiated writes
 * here still bump the durable counter inside their tx (so live caches
 * miss on the next read) but skip the post-commit Hatchet broadcast and
 * rely on the reconciler's next pass to publish the version bump.
 */
const noopInvalidator: Invalidator = {
  bumpDurable: async (tx) => {
    await bumpTenantCacheVersion(tx);
  },
  broadcast: async (_host?: string) => undefined,
};

const productionService = customHostnameService({
  db,
  txtLabel: env.CUSTOM_HOST_VERIFICATION_LABEL,
  invalidator: noopInvalidator,
});

const customHostnameRoutesHandler = buildCustomHostnameRoutes({
  service: productionService,
  cnameTarget: env.CUSTOM_HOST_CNAME_TARGET,
  txtLabel: env.CUSTOM_HOST_VERIFICATION_LABEL,
  appWildcardHost: env.APP_WILDCARD_HOST,
});

export default customHostnameRoutesHandler;
