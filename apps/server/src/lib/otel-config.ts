import { z } from "zod";
import { env } from "@/env";
import packageJson from "../../package.json";

export const SERVICE_NAME = "server" as const;

export const SERVICE_VERSION: string = packageJson.version;

export const { OTEL_ENABLED } = env;

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

const BLOCK_ALL_COOKIES = true as const;

const REDACTED = "[REDACTED]";

const SENSITIVE_BODY_FIELD_SET = new Set<string>(SENSITIVE_BODY_FIELDS);

export type RedactableValue =
  | boolean
  | null
  | number
  | string
  | undefined
  | RedactableValue[]
  | RedactableRecord;

export type RedactableRecord = { [key: string]: RedactableValue };

const numberSchema = z.union([
  z.number(),
  z.nan(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
]);

const redactableValueSchema: z.ZodType<RedactableValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    numberSchema,
    z.string(),
    z.undefined(),
    z.array(redactableValueSchema),
    z.record(z.string(), redactableValueSchema),
  ])
);

const redactableRecordSchema: z.ZodType<RedactableRecord> = z.record(
  z.string(),
  redactableValueSchema
);

const scalarRedactableSchema = z.union([
  z.boolean(),
  z.null(),
  numberSchema,
  z.string(),
  z.undefined(),
]);

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

export function redactSensitiveFields<T extends RedactableRecord>(
  record: T
): T {
  const entries = Object.entries(record).map(([key, value]) => [
    key,
    SENSITIVE_BODY_FIELD_SET.has(key) ? REDACTED : redactValue(value),
  ]);

  // SAFETY: every key is rebuilt from the input record, with values replaced only by the redaction marker or by a parsed value of the same domain.
  return Object.fromEntries(entries) as T;
}

function redactValue(value: RedactableValue): RedactableValue {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  const nested = redactableRecordSchema.safeParse(value);
  if (nested.success) {
    return redactSensitiveFields(nested.data);
  }

  const scalar = scalarRedactableSchema.safeParse(value);
  return scalar.success ? scalar.data : REDACTED;
}

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

export function shouldCaptureCookies(): boolean {
  return !BLOCK_ALL_COOKIES;
}

export const REDACTION_CONFIG = {
  blockAllCookies: BLOCK_ALL_COOKIES,
  isHeaderSafe,
  redactSensitiveFields,
  safeHeaderPatterns: SAFE_HEADER_PATTERNS,
  sanitizeUrl,
  sensitiveBodyFields: SENSITIVE_BODY_FIELDS,
  sensitiveHeaderPatterns: SENSITIVE_HEADER_PATTERNS,
  sensitiveQueryParams: SENSITIVE_QUERY_PARAMS,
  shouldCaptureCookies,
} as const;
