type ResolveClientIpInput = {
  forwardedFor?: string | null;
  realIp?: string | null;
  remoteAddress?: string | null;
  trustProxy: boolean;
};

function firstForwardedIp(forwardedFor: string): string | null {
  const parts = forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const rightmost = parts.at(-1);
  return rightmost ?? null;
}

export function resolveClientIpFromParts(
  input: ResolveClientIpInput
): string | null {
  if (input.trustProxy && input.forwardedFor) {
    const ip = firstForwardedIp(input.forwardedFor);
    if (ip) {
      return ip;
    }
  }

  if (input.realIp && input.realIp.length > 0) {
    return input.realIp;
  }

  if (input.remoteAddress && input.remoteAddress.length > 0) {
    return input.remoteAddress;
  }

  return null;
}

export function resolveClientIpFromHeaders(
  headers: Headers | undefined,
  trustProxy: boolean,
  remoteAddress?: string | null
): string | null {
  return resolveClientIpFromParts({
    forwardedFor: headers?.get("x-forwarded-for"),
    realIp: headers?.get("x-real-ip"),
    remoteAddress: remoteAddress ?? null,
    trustProxy,
  });
}
