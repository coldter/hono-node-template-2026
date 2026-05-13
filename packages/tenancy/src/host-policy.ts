/**
 * Host classification + reserved-slug policy.
 *
 * Single source of truth for "is this host shape an admin / fallback /
 * subdomain / custom / rejected?". Previously the policy was split across
 * `parse-hostname.ts` (parser only) and three call sites that consulted
 * `BUILTIN_RESERVED_SLUGS` inconsistently:
 *   - `resolve-tenant.ts` did NOT consult the reserved set;
 *   - `dev-header.ts` did;
 *   - `host-header-guard.ts` re-parsed only to check empty / invalid_chars.
 *
 * `classifyHost` re-uses `parseHostname` internally so the host-shape
 * parser stays free of policy concerns and so `parseHostname` remains
 * usable by direct callers; `isReserved` is the canonical predicate over
 * `BUILTIN_RESERVED_SLUGS`.
 */

import type { HostConfig } from "./host-config";
import {
  BUILTIN_RESERVED_SLUGS,
  type ParseRejectReason,
  parseHostname,
} from "./parse-hostname";

export function isReserved(slug: string): boolean {
  return BUILTIN_RESERVED_SLUGS.has(slug);
}

export type HostClassification =
  | { kind: "admin" }
  | { kind: "fallback" }
  | { kind: "subdomain"; slug: string; canonicalHost: string }
  | { kind: "custom"; host: string }
  | { kind: "rejected"; reason: ParseRejectReason | "reserved_slug" };

/**
 * Classify a raw `Host` header against the configured apex + admin host
 * shape, applying reserved-slug policy for subdomain matches. The
 * returned shape is a closed discriminated union so downstream consumers
 * (resolver / guard / dev-header) can switch exhaustively without
 * re-parsing.
 */
export function classifyHost(
  raw: string,
  config: HostConfig
): HostClassification {
  const parsed = parseHostname(raw, config);
  switch (parsed.kind) {
    case "admin":
    case "fallback":
      return { kind: parsed.kind };
    case "subdomain": {
      if (isReserved(parsed.slug)) {
        return { kind: "rejected", reason: "reserved_slug" };
      }
      return {
        kind: "subdomain",
        slug: parsed.slug,
        canonicalHost: `${parsed.slug}${config.wildcardSuffix}`,
      };
    }
    case "custom":
      return { kind: "custom", host: parsed.host };
    case "rejected":
      return { kind: "rejected", reason: parsed.reason };
    default: {
      const _exhaustive: never = parsed;
      throw new Error(`unreachable: ${String(_exhaustive)}`);
    }
  }
}
