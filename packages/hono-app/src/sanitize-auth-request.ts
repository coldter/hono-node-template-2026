/**
 * Shared `Request` sanitisation for any host-pinned Better Auth proxy.
 *
 * Both perimeters (tenant-facing and operator-admin) wrap BA behind a Hono
 * middleware that re-builds the inbound request before handing it to BA's
 * fetch handler. The contract they both enforce is identical:
 *
 *   1. Strip proxy-supplied origin headers (X-Forwarded-*, Forwarded,
 *      CF-Connecting-IP, X-Real-IP). If any of these survived into BA's
 *      URL resolver or rate-limit reader, a tenant boundary could be
 *      spoofed (e.g. `X-Forwarded-Host: attacker.example`).
 *   2. Pin `Host` to a value derived from a trusted source (the resolved
 *      tenant's host, or the configured ADMIN_HOST) so BA's URL resolver,
 *      cookie domain, and CSRF check cannot be confused.
 *   3. Forward method, URL, body, redirect, and referrer verbatim so BA
 *      sees an otherwise unchanged request.
 *
 * Streams require `duplex: "half"` on the request init in undici 7 / Node
 * 20+. `lib.dom`'s `RequestInit` doesn't include that field yet, hence
 * the single boundary annotation localised here.
 */

export const STRIPPED_HEADERS = [
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-for",
  "forwarded",
  "cf-connecting-ip",
  "x-real-ip",
] as const;

export type SanitizeAuthRequestOptions = Readonly<{
  /**
   * Host header to pin onto the rebuilt request. Caller supplies the
   * trusted value: for the tenant perimeter this is the resolved
   * `tenant.host`; for the admin perimeter, the configured `ADMIN_HOST`.
   */
  pinHost: string;
}>;

/**
 * Produce a new `Request` cleared of proxy-supplied origin headers and
 * with `Host` pinned to the trusted value the caller supplied. Method,
 * URL, body, redirect, and referrer pass through unchanged.
 */
export function sanitizeAuthRequest(
  req: Request,
  opts: SanitizeAuthRequestOptions
): Request {
  const headers = new Headers(req.headers);
  for (const h of STRIPPED_HEADERS) {
    headers.delete(h);
  }
  headers.set("host", opts.pinHost);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: req.redirect,
    referrer: req.referrer,
  };

  // `body` is only valid on non-GET/HEAD requests. Passing `null` plus
  // `duplex: "half"` throws in undici (TypeError: Request with GET/HEAD
  // method cannot have body); branch instead of casting.
  if (req.body !== null && req.method !== "GET" && req.method !== "HEAD") {
    // boundary: lib.dom RequestInit lacks duplex; undici 7 / Node 20+ requires it for stream bodies
    (init as RequestInit & { duplex?: "half" }).duplex = "half";
    init.body = req.body;
  }

  return new Request(req.url, init);
}
