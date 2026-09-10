import { describe, expect, it } from "vitest";
import { resolveRateLimitKey } from "@/lib/client-ip";

describe("resolveRateLimitKey", () => {
  it("should resolve forwarded, remote, and missing client IPs", () => {
    expect(
      resolveRateLimitKey({
        forwardedFor: "1.1.1.1, 2.2.2.2, 3.3.3.3",
        remoteAddress: "9.9.9.9",
        trustProxy: true,
      })
    ).toBe("3.3.3.3");

    expect(
      resolveRateLimitKey({
        forwardedFor: "1.1.1.1",
        remoteAddress: "9.9.9.9",
        trustProxy: false,
      })
    ).toBe("9.9.9.9");

    expect(
      resolveRateLimitKey({
        forwardedFor: undefined,
        remoteAddress: "9.9.9.9",
        trustProxy: true,
      })
    ).toBe("9.9.9.9");

    expect(
      resolveRateLimitKey({
        forwardedFor: undefined,
        remoteAddress: undefined,
        trustProxy: false,
      })
    ).toBeNull();

    expect(
      resolveRateLimitKey({
        forwardedFor: " , ",
        remoteAddress: undefined,
        trustProxy: true,
      })
    ).toBeNull();
  });
});
