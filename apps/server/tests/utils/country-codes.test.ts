import { describe, expect, it } from "vitest";
import { alpha2ToNumeric } from "@/utils/country-codes";

describe("alpha2ToNumeric", () => {
  it("converts known codes", () => {
    expect(alpha2ToNumeric("US")).toBe("0840");
    expect(alpha2ToNumeric("CA")).toBe("0124");
    expect(alpha2ToNumeric("GB")).toBe("0826");
    expect(alpha2ToNumeric("IN")).toBe("0356");
    expect(alpha2ToNumeric("AU")).toBe("0036");
    expect(alpha2ToNumeric("JP")).toBe("0392");
    expect(alpha2ToNumeric("DE")).toBe("0276");
    expect(alpha2ToNumeric("FR")).toBe("0250");
    expect(alpha2ToNumeric("MX")).toBe("0484");
  });

  it("is case-insensitive", () => {
    expect(alpha2ToNumeric("us")).toBe("0840");
    expect(alpha2ToNumeric("Us")).toBe("0840");
  });

  it("returns input unchanged for unknown codes", () => {
    expect(alpha2ToNumeric("XX")).toBe("XX");
    expect(alpha2ToNumeric("ZZ")).toBe("ZZ");
  });
});
