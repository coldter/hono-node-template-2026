import type { MiddlewareHandler } from "hono";
import type { HostConfig } from "./host-config";
import { classifyHost } from "./host-policy";

export type HostHeaderGuardOptions = Readonly<{
  config: HostConfig;
}>;

const STATUS_BAD_REQUEST = 400;

/**
 * Fail-closed guard that runs BEFORE tenantMiddleware. Only rejects
 * unambiguously bad shapes (empty / invalid chars); valid-shape but
 * unknown-tenant hosts (nested_subdomain, slug_format, punycode,
 * reserved_slug) pass through so tenantMiddleware can return 404
 * instead of 400.
 *
 * Implementation is a 3-line wrapper over `classifyHost` so the policy
 * stays in one place.
 */
export function hostHeaderGuard(
  opts: HostHeaderGuardOptions
): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header("host") ?? "";
    if (host === "") {
      return c.text("Bad Request: missing Host header", STATUS_BAD_REQUEST);
    }
    const classified = classifyHost(host, opts.config);
    if (
      classified.kind === "rejected" &&
      (classified.reason === "empty" || classified.reason === "invalid_chars")
    ) {
      return c.text(`Bad Request: ${classified.reason}`, STATUS_BAD_REQUEST);
    }
    await next();
    return;
  };
}
