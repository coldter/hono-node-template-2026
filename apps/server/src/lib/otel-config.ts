import { env } from "@/env";

/**
 * OpenTelemetry Configuration - PCI DSS Compliant
 *
 * Design Principles:
 * - Single env var (OTEL_ENABLED) controls everything
 * - No sensitive data in telemetry by default
 * - Header deny-list (whitelist approach)
 * - Body field redaction
 * - Cookie exclusion (all blocked)
 * - Query param filtering
 */

export const SERVICE_NAME = "server" as const;
export const SERVICE_VERSION = "1.0.0" as const;

/**
 * Main toggle
 */
export const OTEL_ENABLED = env.OTEL_ENABLED;

/**
 * Sensitive Header Patterns (BLOCKED by default)
 */
const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-api-key$/i,
  /^x-auth-token$/i,
  /^x-csrf-token$/i,
  /^x-xsrf-token$/i,
  /^session$/i,
  /^session-id$/i,
  /^xsrf-token$/i,
  /^x-.*/i,
  /^api-.*key$/i,
  /^better-auth.*/i,
] as const;

/**
 * Safe Header Patterns (ALLOWED)
 */
const SAFE_HEADER_PATTERNS = [
  /^content-type$/i,
  /^content-length$/i,
  /^content-encoding$/i,
  /^accept$/i,
  /^accept-encoding$/i,
  /^accept-language$/i,
  /^user-agent$/i,
  /^traceparent$/i,
  /^tracestate$/i,
  /^origin$/i,
  /^access-control-request-method$/i,
  /^access-control-request-headers$/i,
] as const;

/**
 * Sensitive Body Fields (REDACTED)
 */
const SENSITIVE_BODY_FIELDS = [
  "password",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "token",
  "refreshToken",
  "accessToken",
  "apiKey",
  "secretKey",
  "email",
  "phone",
  "phoneNumber",
  "socialSecurityNumber",
  "ssn",
  "creditCard",
  "cardNumber",
  "cvv",
  "cvc",
  "sessionToken",
  "sessionId",
  "csrfToken",
] as const;

/**
 * Sensitive Query Params (REDACTED)
 */
const SENSITIVE_QUERY_PARAMS = [
  "token",
  "api_key",
  "apiKey",
  "session",
  "session_id",
  "sessionId",
  "auth",
  "auth_token",
] as const;

/**
 * Cookie Handling (ALL BLOCKED)
 */
const BLOCK_ALL_COOKIES = true as const;

/**
 * Utility: Check if header is safe to capture
 */
export function isHeaderSafe(headerName: string): boolean {
  for (const pattern of SENSITIVE_HEADER_PATTERNS) {
    if (pattern.test(headerName)) {
      return false;
    }
  }

  for (const pattern of SAFE_HEADER_PATTERNS) {
    if (pattern.test(headerName)) {
      return true;
    }
  }

  return false;
}

/**
 * Utility: Redact sensitive fields from object
 */
export function redactSensitiveFields<T extends Record<string, unknown>>(
  obj: T
): T {
  const result = { ...obj };

  for (const field of SENSITIVE_BODY_FIELDS) {
    if (field in result) {
      (result as Record<string, unknown>)[field] = "[REDACTED]";
    }
  }

  for (const key in result) {
    if (Object.hasOwn(result, key)) {
      const value = result[key];
      if (typeof value === "object" && value !== null) {
        (result as Record<string, unknown>)[key] = redactSensitiveFields(
          value as Record<string, unknown>
        );
      }
    }
  }

  return result;
}

/**
 * Utility: Sanitize URL (remove sensitive query params)
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    for (const param of SENSITIVE_QUERY_PARAMS) {
      params.delete(param);
    }

    if (params.toString() === "") {
      urlObj.search = "";
    }

    return urlObj.toString();
  } catch {
    const parts = url.split("?");
    return parts.at(0) ?? "";
  }
}

/**
 * Utility: Check if cookie header should be captured
 */
export function shouldCaptureCookies(): boolean {
  return !BLOCK_ALL_COOKIES;
}

export const REDACTION_CONFIG = {
  isHeaderSafe,
  redactSensitiveFields,
  sanitizeUrl,
  shouldCaptureCookies,
  sensitiveHeaderPatterns: SENSITIVE_HEADER_PATTERNS,
  safeHeaderPatterns: SAFE_HEADER_PATTERNS,
  sensitiveBodyFields: SENSITIVE_BODY_FIELDS,
  sensitiveQueryParams: SENSITIVE_QUERY_PARAMS,
  blockAllCookies: BLOCK_ALL_COOKIES,
} as const;
