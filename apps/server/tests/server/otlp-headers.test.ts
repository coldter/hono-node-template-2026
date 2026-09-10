import { describe, expect, it } from "vitest";
import { parseOtlpHeaders } from "@/env";

const MALFORMED_PAIR = /malformed header pair/;
const MUST_BE_STRING = /must be a string/;

describe("parseOtlpHeaders", () => {
  it("should parse comma-separated pairs, splitting on the first equals sign and trimming", () => {
    expect(
      parseOtlpHeaders(
        " Authorization = Bearer a=b=c , X-Axiom-Dataset = my-dataset "
      )
    ).toEqual({
      Authorization: "Bearer a=b=c",
      "X-Axiom-Dataset": "my-dataset",
    });
  });

  it("should accept a JSON object for backward compatibility", () => {
    expect(parseOtlpHeaders('{"Authorization":"Bearer x"}')).toEqual({
      Authorization: "Bearer x",
    });
  });

  it("should reject a malformed header pair", () => {
    expect(() => parseOtlpHeaders("Authorization=")).toThrow(MALFORMED_PAIR);
    expect(() => parseOtlpHeaders("=value")).toThrow(MALFORMED_PAIR);
  });

  it("should reject JSON that is not an object of strings", () => {
    expect(() => parseOtlpHeaders('{"a":1}')).toThrow(MUST_BE_STRING);
    expect(() => parseOtlpHeaders("{not json")).toThrow();
  });
});
