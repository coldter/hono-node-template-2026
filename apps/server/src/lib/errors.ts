import { useTenantMaybe } from "@repo/tenancy";
import { DrizzleQueryError } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import pg from "pg";
import { PostgresError } from "pg-error-enum";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { logger } from "@/lib/logger";

function errorResponse(
  code: string,
  message: string,
  details?: string
): { error: { code: string; message: string; details?: string } } {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

export function handleError(err: Error, c: Context<Env>): Response {
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      // Handler may fire before tenancy resolution (e.g. hostHeaderGuard rejection); `useTenantMaybe` returns null in that window.
      // biome-ignore lint/correctness/useHookAtTopLevel: accessor Module from @repo/tenancy is not a React hook
      const tenant = useTenantMaybe(c);
      logger.error("HTTPException 500", {
        message: err.message,
        status: err.status,
        path: c.req.path,
        method: c.req.method,
        tenantId: tenant?.organizationId,
        tenantSlug: tenant?.slug ?? undefined,
        error: err,
      });
    }
    const causeCode =
      typeof err.cause === "object" &&
      err.cause !== null &&
      "code" in err.cause &&
      typeof (err.cause as { code?: unknown }).code === "string"
        ? (err.cause as { code: string }).code
        : null;
    const defaultCodeByStatus: Record<number, string> = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      429: "RATE_LIMITED",
      500: "INTERNAL_SERVER_ERROR",
      503: "SERVICE_UNAVAILABLE",
    };
    const errorCode =
      causeCode ??
      defaultCodeByStatus[err.status] ??
      (err.status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED");

    const responseMessage =
      env.NODE_ENV === "production" && err.status === 500
        ? "internal server error"
        : err.message;

    return c.json(errorResponse(errorCode, responseMessage), {
      status: err.status,
    });
  }

  if (err instanceof DrizzleQueryError) {
    logger.error("DatabaseError", { error: err });
    if (!(err.cause instanceof pg.DatabaseError)) {
      return c.json(
        errorResponse("DATABASE_ERROR", "database error occurred"),
        { status: 500 }
      );
    }
    if (err.cause?.code === PostgresError.UNIQUE_VIOLATION) {
      const message = err.cause?.detail || "Duplicate value exists";
      return c.json(errorResponse("UNIQUE_VIOLATION", message), {
        status: 409,
      });
    }
  }

  logger.error("unhandled exception", {
    name: err?.name,
    message: err?.message,
    cause: err?.cause,
    stack: err?.stack,
    constructor: err?.constructor.name,
  });

  return c.json(
    errorResponse(
      "INTERNAL_SERVER_ERROR",
      err.message ?? "something unexpected happened"
    ),
    { status: 500 }
  );
}
