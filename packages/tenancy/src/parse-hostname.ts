import type { HostConfig } from "./host-config";

// inner group wrapped in (?:...)? so single-character slugs pass
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

const PORT_RE = /:.*$/;
const TRAILING_DOT_RE = /\.+$/;
// applied after .toLowerCase(); uppercase intentionally excluded
const INVALID_CHAR_RE = /[^a-z0-9.-]/;

// NOT consulted inside parseHostname; callers check separately so a reserved slug still parses as subdomain shape
export const BUILTIN_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "auth",
  "api",
  "app",
  "assets",
  "cdn",
  "console",
  "dashboard",
  "docs",
  "internal",
  "login",
  "logout",
  "ops",
  "operator",
  "platform",
  "register",
  "root",
  "signup",
  "static",
  "status",
  "support",
  "system",
  "www",
] as const);

export type ParseRejectReason =
  | "empty"
  | "invalid_chars"
  | "punycode"
  | "nested_subdomain"
  | "slug_format";

export type ParsedHost =
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; host: string }
  | { kind: "admin" }
  | { kind: "fallback" }
  | { kind: "rejected"; reason: ParseRejectReason };

export function parseHostname(host: string, config: HostConfig): ParsedHost {
  const stripped = host
    .replace(PORT_RE, "")
    .replace(TRAILING_DOT_RE, "")
    .normalize("NFC")
    .toLowerCase();

  if (stripped.length === 0) {
    return { kind: "rejected", reason: "empty" };
  }

  if (INVALID_CHAR_RE.test(stripped)) {
    return { kind: "rejected", reason: "invalid_chars" };
  }

  if (stripped === config.adminHost) {
    return { kind: "admin" };
  }

  if (stripped === config.fallbackHost) {
    return { kind: "fallback" };
  }

  if (stripped.endsWith(config.wildcardSuffix)) {
    // rejects punycode under wildcard to deny homoglyph confusables against the platform apex
    const labels = stripped.split(".");
    if (labels.some((label) => label.startsWith("xn--"))) {
      return { kind: "rejected", reason: "punycode" };
    }

    const slug = stripped.slice(
      0,
      stripped.length - config.wildcardSuffix.length
    );

    if (slug.includes(".")) {
      return { kind: "rejected", reason: "nested_subdomain" };
    }

    if (!SLUG_RE.test(slug)) {
      return { kind: "rejected", reason: "slug_format" };
    }

    return { kind: "subdomain", slug };
  }

  // Custom host — punycode allowed for IDN tenant apexes.
  return { kind: "custom", host: stripped };
}
