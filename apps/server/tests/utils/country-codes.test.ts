import { describe, expect, it } from "vitest";
import { alpha2ToNumeric } from "@/utils/country-codes";

describe("alpha2ToNumeric", () => {
  it("should map known codes case-insensitively and pass unknown codes through", () => {
    expect(alpha2ToNumeric("us")).toBe("0840");
    expect(alpha2ToNumeric("Us")).toBe("0840");
    expect(alpha2ToNumeric("XX")).toBe("XX");
    expect(alpha2ToNumeric("ZZ")).toBe("ZZ");
  });
});
