/**
 * Per-request host/origin policy for Better Auth.
 *
 * Concentrates two related decisions behind one seam:
 *   - `allowedHosts`: the static host allowlist BA validates the request
 *     `Host` header against before deriving a baseURL.
 *   - `trustedOrigins(req)`: the per-request origin allowlist BA matches
 *     `Origin`/`Referer` against for CSRF protection.
 *
 * Both incorporate the same tenant-append rule: when a tenant is resolved,
 * its host/origin is accepted in addition to the static set. Defined here
 * exactly once so callers cannot drift.
 */

import type { HostConfig, Tenant } from "@repo/tenancy";
import { parseHostname } from "@repo/tenancy";

export type AllowedHostsSnapshot = Readonly<{
  /** Wildcard suffix including the leading dot, e.g. ".app.example.com". */
  wildcardSuffix: string;
  /** Lower-case admin hostname, e.g. "admin.example.com". */
  adminHost: string;
  /** Additional verified custom hostnames for tenant apex domains. */
  customHosts: readonly string[];
  /** Localhost / local-dev hosts to include in non-production environments. */
  localDevHosts: readonly string[];
  nodeEnv: "development" | "production" | "test";
}>;

export type AuthHostPolicyInput = Readonly<{
  snapshot: AllowedHostsSnapshot;
  tenant: Tenant | null;
  tenantConfig: HostConfig;
  extraTrustedOrigins?: readonly string[];
}>;

export type AuthHostPolicy = Readonly<{
  allowedHosts: readonly string[];
  trustedOrigins: (req: Request | undefined) => Promise<readonly string[]>;
}>;

const LEADING_DOT_RE = /^\./;

// The wildcard suffix is normalised to include a leading dot.
export function buildAllowedHostsSnapshot(input: {
  hostConfig: HostConfig;
  customHosts?: readonly string[];
  localDevHosts?: readonly string[];
}): AllowedHostsSnapshot {
  const { hostConfig, customHosts = [], localDevHosts = [] } = input;
  const suffix = hostConfig.wildcardSuffix.startsWith(".")
    ? hostConfig.wildcardSuffix
    : `.${hostConfig.wildcardSuffix}`;
  return Object.freeze({
    wildcardSuffix: suffix,
    adminHost: hostConfig.adminHost,
    customHosts: Object.freeze([...customHosts]),
    localDevHosts: Object.freeze([...localDevHosts]),
    nodeEnv: hostConfig.nodeEnv,
  });
}

function deriveBaseAllowedHosts(snap: AllowedHostsSnapshot): string[] {
  const apex = snap.wildcardSuffix.replace(LEADING_DOT_RE, "");
  const out: string[] = [
    apex,
    `*${snap.wildcardSuffix}`,
    snap.adminHost,
    ...snap.customHosts,
  ];
  if (snap.nodeEnv !== "production") {
    out.push(...snap.localDevHosts);
  }
  return out;
}

export function buildAuthHostPolicy(
  input: AuthHostPolicyInput
): AuthHostPolicy {
  const base = deriveBaseAllowedHosts(input.snapshot);
  if (input.tenant && !base.includes(input.tenant.host)) {
    base.push(input.tenant.host);
  }
  const allowedHosts = Object.freeze(base);

  const trustedOrigins = async (
    req: Request | undefined
  ): Promise<readonly string[]> => {
    if (!req) {
      return Object.freeze([]);
    }

    const host = new URL(req.url).host;
    const parsed = parseHostname(host, input.tenantConfig);

    if (
      (parsed.kind === "subdomain" || parsed.kind === "custom") &&
      input.tenant !== null
    ) {
      return Object.freeze([
        `https://${input.tenant.host}`,
        ...(input.extraTrustedOrigins ?? []),
      ]);
    }

    return Object.freeze([...(input.extraTrustedOrigins ?? [])]);
  };

  return Object.freeze({ allowedHosts, trustedOrigins });
}
