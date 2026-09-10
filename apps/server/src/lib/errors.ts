import { DrizzleQueryError } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import pg from "pg";
import { PostgresError } from "pg-error-enum";
import { z } from "zod";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { logger } from "@/lib/logger";
import { getTraceIdFromContext } from "@/lib/otel-utils";

const errorCauseSchema = z.object({ code: z.string() });

const defaultCodeByStatus = new Map([
  [400, "BAD_REQUEST"],
  [401, "UNAUTHORIZED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [405, "METHOD_NOT_ALLOWED"],
  [409, "CONFLICT"],
  [429, "RATE_LIMITED"],
  [500, "INTERNAL_SERVER_ERROR"],
  [503, "SERVICE_UNAVAILABLE"],
]);

function errorResponse(code: string, message: string, details?: string) {
  if (!details) {
    return { error: { code, message } };
  }

  return { error: { code, details, message } };
}

function requestCorrelation(c: Context<Env>) {
  return {
    request_id: c.get("requestId") ?? null,
    trace_id: getTraceIdFromContext(c),
  };
}

export function handleError(err: Error, c: Context<Env>): Response {
  if (err instanceof HTTPException) {
    if (err.status >= 500) {
      logger.error("HTTPException 500", {
        contentType: c.req.header("content-type") ?? null,
        message: err.message,
        method: c.req.method,
        path: c.req.path,
        status: err.status,
        ...requestCorrelation(c),
      });
    }
    const parsedCause = errorCauseSchema.safeParse(err.cause);
    const causeCode = parsedCause.success ? parsedCause.data.code : null;
    const errorCode =
      causeCode ??
      defaultCodeByStatus.get(err.status) ??
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
    logger.error("DatabaseError", { error: err, ...requestCorrelation(c) });
    if (!(err.cause instanceof pg.DatabaseError)) {
      return c.json(
        errorResponse("DATABASE_ERROR", "database error occurred"),
        { status: 500 }
      );
    }
    if (err.cause?.code === PostgresError.UNIQUE_VIOLATION) {
      const message =
        env.NODE_ENV === "production"
          ? "Duplicate value exists"
          : err.cause?.detail || "Duplicate value exists";
      return c.json(errorResponse("UNIQUE_VIOLATION", message), {
        status: 409,
      });
    }
  }

  if (err?.name === "UserNotFoundError") {
    return c.json(errorResponse("NOT_FOUND", "User not found"), {
      status: 404,
    });
  }

  logger.error("unhandled exception", {
    cause: err?.cause,
    constructor: err?.constructor.name,
    message: err?.message,
    name: err?.name,
    stack: err?.stack,
    ...requestCorrelation(c),
  });

  return c.json(
    errorResponse(
      "INTERNAL_SERVER_ERROR",
      env.NODE_ENV === "production"
        ? "internal server error"
        : (err.message ?? "something unexpected happened")
    ),
    { status: 500 }
  );
}
