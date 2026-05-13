/**
 * `/api/admin/operator-enroll` — operator-onboarding HTTP perimeter.
 *
 * The lifecycle (`./lifecycle.ts`) is the single writer for `global_admins`
 * enrollment columns; handlers translate the lifecycle's typed errors into
 * HTTP responses. Invite, list, and explicit-expire are gated by
 * `requireOperator(action)`; the redeem path is intentionally unauthenticated
 * because the invitee has no operator session yet — its security envelope
 * is the unguessable enrollment token + the `pending`-row gate.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { DrizzleClient } from "@repo/db";
import { globalAdmins } from "@repo/db/schema";
import { and, desc, gt, isNotNull, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/lib/context";
import {
  type LifecycleHttpMapping,
  lifecycleToHttp,
} from "@/lib/lifecycle-http";
import { requireOperatorPrincipal } from "@/lib/principal";
import { requireOperator } from "@/middlewares/require-operator";
import {
  applyEnrollmentTransition,
  EnrollmentLifecycleError,
  type EnrollmentLifecycleErrorCode,
} from "./lifecycle";
import {
  enrollmentIdParam,
  inviteOperatorBody,
  inviteResponse,
  listPendingResponse,
} from "./schema";

const DEFAULT_TTL_DAYS = 7;

export type EnrollRoutesDeps = Readonly<{
  db: DrizzleClient;
  hashPassword: (password: string) => Promise<string>;
}>;

/**
 * Map enrollment lifecycle-domain error codes to HTTP. `invalid_token` and
 * `expired` carry overridden messages so the wire response never leaks
 * whether a similar pending row exists (a wrong token must look identical
 * to a missing row).
 */
const LIFECYCLE_HTTP_MAP = {
  not_found: { status: 404 },
  invalid_transition: { status: 409 },
  duplicate_invite: { status: 409 },
  invalid_token: { status: 404, message: "Invalid enrollment token" },
  expired: { status: 410, message: "Enrollment token expired" },
  already_bound: { status: 409 },
} as const satisfies Record<EnrollmentLifecycleErrorCode, LifecycleHttpMapping>;

const throwLifecycle: (err: unknown) => never = lifecycleToHttp(
  (err): err is EnrollmentLifecycleError =>
    err instanceof EnrollmentLifecycleError,
  LIFECYCLE_HTTP_MAP
);

function throwForLifecycleError(err: unknown): never {
  throwLifecycle(err);
}

const tokenParam = z.object({ token: z.string().min(1) });

const redeemBodyParam = z.object({
  password: z
    .string()
    .min(12, "password must be at least 12 characters")
    .max(256),
  displayName: z.string().min(1).max(120).optional(),
  // Body-side `token` is optional and, when present, must match the URL one.
  token: z.string().min(16).max(256).optional(),
});

const redeemResponse = z.object({
  enrollmentId: z.string(),
  userId: z.string(),
  email: z.string(),
  subRole: z.enum(["platform_admin", "support", "read_only"]),
});

const expireResponse = z.object({ enrollmentId: z.string() });

const inviteRoute = createRoute({
  operationId: "inviteOperator",
  method: "post",
  path: "/",
  tags: ["admin-enroll"],
  summary: "Invite operator",
  middleware: [requireOperator("global_admin.invite")] as const,
  request: {
    body: {
      content: { "application/json": { schema: inviteOperatorBody } },
    },
  },
  responses: {
    201: {
      description: "Invite issued",
      content: { "application/json": { schema: inviteResponse } },
    },
  },
});

const listPendingRoute = createRoute({
  operationId: "listPendingEnrollments",
  method: "get",
  path: "/",
  tags: ["admin-enroll"],
  summary: "List pending enrollments",
  middleware: [requireOperator("global_admin.list")] as const,
  responses: {
    200: {
      description: "Pending enrollments",
      content: { "application/json": { schema: listPendingResponse } },
    },
  },
});

// Redeem is intentionally unauthenticated — the token is the credential.
const redeemRoute = createRoute({
  operationId: "redeemEnrollment",
  method: "post",
  path: "/{token}/redeem",
  tags: ["admin-enroll"],
  summary: "Redeem enrollment token",
  request: {
    params: tokenParam,
    body: {
      content: { "application/json": { schema: redeemBodyParam } },
    },
  },
  responses: {
    200: {
      description: "Enrollment redeemed",
      content: { "application/json": { schema: redeemResponse } },
    },
  },
});

const expireRoute = createRoute({
  operationId: "expireEnrollment",
  method: "post",
  path: "/{id}/expire",
  tags: ["admin-enroll"],
  summary: "Expire enrollment",
  middleware: [requireOperator("global_admin.expire")] as const,
  request: { params: enrollmentIdParam },
  responses: {
    200: {
      description: "Enrollment expired",
      content: { "application/json": { schema: expireResponse } },
    },
  },
});

export function buildEnrollRoutes(deps: EnrollRoutesDeps) {
  const app = new OpenAPIHono<Env>();

  app.openapi(inviteRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const body = c.req.valid("json");
    try {
      const result = await applyEnrollmentTransition(
        {
          kind: "invite",
          data: {
            email: body.email,
            subRole: body.subRole,
            ttlDays: body.ttlDays ?? DEFAULT_TTL_DAYS,
            actor: { id: principal.operator.id },
          },
        },
        deps
      );
      // Narrow on result shape: invite always returns an `InviteResult`.
      if (!("token" in result)) {
        throw new HTTPException(500, {
          message: "invite returned an unexpected result shape",
          cause: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
      return c.json(
        {
          enrollmentId: result.enrollmentId,
          token: result.token,
          expiresAt: result.expiresAt.toISOString(),
        },
        201
      );
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(listPendingRoute, async (c) => {
    const now = new Date();
    const rows = await deps.db
      .select({
        id: globalAdmins.id,
        email: globalAdmins.email,
        subRole: globalAdmins.subRole,
        expiresAt: globalAdmins.enrollmentExpiresAt,
        invitedAt: globalAdmins.createdAt,
      })
      .from(globalAdmins)
      .where(
        and(
          isNull(globalAdmins.boundAt),
          isNotNull(globalAdmins.enrollmentTokenHash),
          gt(globalAdmins.enrollmentExpiresAt, now)
        )
      )
      .orderBy(desc(globalAdmins.createdAt));

    return c.json(
      {
        rows: rows.map((r) => ({
          id: r.id,
          email: r.email,
          subRole: r.subRole,
          expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
          invitedAt: r.invitedAt.toISOString(),
        })),
      },
      200
    );
  });

  app.openapi(redeemRoute, async (c) => {
    const { token } = c.req.valid("param");
    const body = c.req.valid("json");
    // When the body carries a token it must match the URL token: the URL
    // form is canonical, the body form is a future-affordance for a
    // paste-the-token form UI.
    if (body.token && body.token !== token) {
      throw new HTTPException(400, {
        message: "body token does not match URL token",
        cause: { code: "BAD_REQUEST" },
      });
    }
    try {
      const result = await applyEnrollmentTransition(
        {
          kind: "redeem",
          data: {
            token,
            password: body.password,
            displayName: body.displayName,
          },
        },
        deps
      );
      if (!("userId" in result)) {
        throw new HTTPException(500, {
          message: "redeem returned an unexpected result shape",
          cause: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
      return c.json(
        {
          enrollmentId: result.enrollmentId,
          userId: result.userId,
          email: result.email,
          subRole: result.subRole,
        },
        200
      );
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  app.openapi(expireRoute, async (c) => {
    const principal = requireOperatorPrincipal(c);
    const { id } = c.req.valid("param");
    try {
      const result = await applyEnrollmentTransition(
        {
          kind: "expire",
          data: {
            enrollmentId: id,
            actor: { id: principal.operator.id },
          },
        },
        deps
      );
      return c.json({ enrollmentId: result.enrollmentId }, 200);
    } catch (err) {
      throwForLifecycleError(err);
    }
  });

  return app;
}
