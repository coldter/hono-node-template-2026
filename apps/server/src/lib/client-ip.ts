type RateLimitKeyInput = {
  forwardedFor: string | undefined;
  remoteAddress: string | undefined;
  trustProxy: boolean;
};

// Rightmost X-Forwarded-For entry is the one appended by our own proxy;
// leftmost entries are client-supplied and attacker-rotatable.
export function resolveRateLimitKey(input: RateLimitKeyInput): string | null {
  if (input.trustProxy && input.forwardedFor) {
    const parts = input.forwardedFor
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const rightmost = parts.at(-1);
    if (rightmost) {
      return rightmost;
    }
  }

  return input.remoteAddress && input.remoteAddress.length > 0
    ? input.remoteAddress
    : null;
}
