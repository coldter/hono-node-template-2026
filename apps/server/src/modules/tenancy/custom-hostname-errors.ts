/**
 * Typed error class for the custom-hostname lifecycle.
 *
 * The service / lifecycle module throws structured errors that the HTTP
 * layer converts to Hono `HTTPException`s. Codes are a closed union so the
 * route's `errorForCode` is exhaustive without a `default` arm.
 */

export const CUSTOM_HOSTNAME_ERROR_CODES = [
  "max_pending",
  "rate_limit_24h",
  "not_found",
  "verify_no_record",
  "verify_mismatch",
  "verify_resolver_error",
  "duplicate_hostname",
  "invalid_hostname",
  "invalid_transition",
] as const;

export type CustomHostnameErrorCode =
  (typeof CUSTOM_HOSTNAME_ERROR_CODES)[number];

export class CustomHostnameError extends Error {
  readonly code: CustomHostnameErrorCode;

  constructor(code: CustomHostnameErrorCode, message?: string) {
    super(message ?? code);
    this.name = "CustomHostnameError";
    this.code = code;
  }
}
