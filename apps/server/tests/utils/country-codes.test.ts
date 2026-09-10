import { describe, expect, it } from "vitest";
import { alpha2ToNumeric } from "@/utils/country-codes";

describe("alpha2ToNumeric", () => {
  it("is case-insensitive", () => {
    expect(alpha2ToNumeric("us")).toBe("0840");
    expect(alpha2ToNumeric("Us")).toBe("0840");
  });

  it("returns input unchanged for unknown codes", () => {
    expect(alpha2ToNumeric("XX")).toBe("XX");
    expect(alpha2ToNumeric("ZZ")).toBe("ZZ");
  });
});
