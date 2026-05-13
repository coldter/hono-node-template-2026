import type { HostConfig } from "./host-config";
import { isReserved } from "./host-policy";
import { SLUG_RE } from "./parse-hostname";

export type DevHeaderResult =
  | { kind: "rewrite"; host: string }
  | {
      kind: "ignored";
      reason: "production" | "env_flag_unset" | "slug_format" | "reserved";
    };

export function resolveDevTenantHeader(
  rawSlug: string,
  cfg: HostConfig,
  allowFlag: string | undefined
): DevHeaderResult {
  if (cfg.nodeEnv === "production") {
    return { kind: "ignored", reason: "production" };
  }
  if (allowFlag !== "1") {
    return { kind: "ignored", reason: "env_flag_unset" };
  }
  const slug = rawSlug.toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { kind: "ignored", reason: "slug_format" };
  }
  if (isReserved(slug)) {
    return { kind: "ignored", reason: "reserved" };
  }
  return { kind: "rewrite", host: `${slug}${cfg.wildcardSuffix}` };
}
