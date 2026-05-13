import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { env } from "@/env";
import type { Env } from "@/lib/context";

/**
 * Error envelope mirrors the tenant-server's shape so admin-UI consumers
 * get a consistent error code/message contract across the two perimeters.
 */
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

const DEFAULT_CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  500: "INTERNAL_SERVER_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export function handleError(err: Error, c: Context<Env>): Response {
  if (err instanceof HTTPException) {
    const causeCode =
      typeof err.cause === "object" &&
      err.cause !== null &&
      "code" in err.cause &&
      typeof (err.cause as { code?: unknown }).code === "string"
        ? (err.cause as { code: string }).code
        : null;
    const errorCode =
      causeCode ??
      DEFAULT_CODE_BY_STATUS[err.status] ??
      (err.status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED");

    const responseMessage =
      env.NODE_ENV === "production" && err.status === 500
        ? "internal server error"
        : err.message;

    return c.json(errorResponse(errorCode, responseMessage), {
      status: err.status,
    });
  }

  return c.json(
    errorResponse(
      "INTERNAL_SERVER_ERROR",
      err.message ?? "something unexpected happened"
    ),
    { status: 500 }
  );
}
