import { resolveClientIpFromParts } from "@/lib/ip";

type RateLimitKeyInput = {
  forwardedFor: string | undefined;
  remoteAddress: string | undefined;
  trustProxy: boolean;
};

export function resolveRateLimitKey(input: RateLimitKeyInput): string | null {
  return resolveClientIpFromParts({
    forwardedFor: input.forwardedFor ?? null,
    remoteAddress: input.remoteAddress ?? null,
    trustProxy: input.trustProxy,
  });
}
