import { describe, expect, it } from "vitest";
import { resolveRateLimitKey } from "@/lib/client-ip";

describe("resolveRateLimitKey", () => {
  it("should use the rightmost x-forwarded-for entry when trustProxy is true", () => {
    const key = resolveRateLimitKey({
      forwardedFor: "1.1.1.1, 2.2.2.2, 3.3.3.3",
      remoteAddress: "9.9.9.9",
      trustProxy: true,
    });
    expect(key).toBe("3.3.3.3");
  });

  it("should ignore x-forwarded-for entirely when trustProxy is false", () => {
    const key = resolveRateLimitKey({
      forwardedFor: "1.1.1.1",
      remoteAddress: "9.9.9.9",
      trustProxy: false,
    });
    expect(key).toBe("9.9.9.9");
  });

  it("should fall back to remote address when trustProxy is true but header is absent", () => {
    const key = resolveRateLimitKey({
      forwardedFor: undefined,
      remoteAddress: "9.9.9.9",
      trustProxy: true,
    });
    expect(key).toBe("9.9.9.9");
  });

  it("should return null when no IP is resolvable", () => {
    const key = resolveRateLimitKey({
      forwardedFor: undefined,
      remoteAddress: undefined,
      trustProxy: false,
    });
    expect(key).toBeNull();
  });

  it("should never return an empty string for a whitespace-only header", () => {
    const key = resolveRateLimitKey({
      forwardedFor: " , ",
      remoteAddress: undefined,
      trustProxy: true,
    });
    expect(key).toBeNull();
  });
});
