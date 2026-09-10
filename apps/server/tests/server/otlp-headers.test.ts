import { describe, expect, it } from "vitest";
import { parseOtlpHeaders } from "@/env";

const MALFORMED_PAIR = /malformed header pair/;
const MUST_BE_STRING = /must be a string/;

describe("parseOtlpHeaders", () => {
  it("should parse comma-separated pairs and JSON, and reject malformed input", () => {
    expect(
      parseOtlpHeaders(
        " Authorization = Bearer a=b=c , X-Axiom-Dataset = my-dataset "
      )
    ).toEqual({
      Authorization: "Bearer a=b=c",
      "X-Axiom-Dataset": "my-dataset",
    });

    expect(parseOtlpHeaders('{"Authorization":"Bearer x"}')).toEqual({
      Authorization: "Bearer x",
    });

    expect(() => parseOtlpHeaders("Authorization=")).toThrow(MALFORMED_PAIR);
    expect(() => parseOtlpHeaders("=value")).toThrow(MALFORMED_PAIR);
    expect(() => parseOtlpHeaders('{"a":1}')).toThrow(MUST_BE_STRING);
    expect(() => parseOtlpHeaders("{not json")).toThrow();
  });
});
