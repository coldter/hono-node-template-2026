import { describe, expect, it } from "vitest";

import { shouldAutoLink } from "../sso-link-rules";

describe("shouldAutoLink (A4.4)", () => {
  it("returns true when all three conditions hold", () => {
    expect(
      shouldAutoLink({
        emailVerified: true,
        hasMembership: true,
        domainVerified: true,
      })
    ).toBe(true);
  });

  it("returns false when emailVerified is false", () => {
    expect(
      shouldAutoLink({
        emailVerified: false,
        hasMembership: true,
        domainVerified: true,
      })
    ).toBe(false);
  });

  it("returns false when hasMembership is false", () => {
    expect(
      shouldAutoLink({
        emailVerified: true,
        hasMembership: false,
        domainVerified: true,
      })
    ).toBe(false);
  });

  it("returns false when domainVerified is false", () => {
    expect(
      shouldAutoLink({
        emailVerified: true,
        hasMembership: true,
        domainVerified: false,
      })
    ).toBe(false);
  });

  // Remaining four cells of the 2^3 truth table — guard against any future
  // attempt to relax the rule to a "majority vote" or "any two true" shape.
  it("returns false when only emailVerified is true", () => {
    expect(
      shouldAutoLink({
        emailVerified: true,
        hasMembership: false,
        domainVerified: false,
      })
    ).toBe(false);
  });

  it("returns false when only hasMembership is true", () => {
    expect(
      shouldAutoLink({
        emailVerified: false,
        hasMembership: true,
        domainVerified: false,
      })
    ).toBe(false);
  });

  it("returns false when only domainVerified is true", () => {
    expect(
      shouldAutoLink({
        emailVerified: false,
        hasMembership: false,
        domainVerified: true,
      })
    ).toBe(false);
  });

  it("returns false when all three are false", () => {
    expect(
      shouldAutoLink({
        emailVerified: false,
        hasMembership: false,
        domainVerified: false,
      })
    ).toBe(false);
  });
});
