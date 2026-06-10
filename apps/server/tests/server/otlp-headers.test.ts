import { describe, expect, it } from "vitest";
import { parseOtlpHeaders } from "@/env";

const MALFORMED_PAIR = /malformed header pair/;
const MUST_BE_STRING = /must be a string/;

describe("parseOtlpHeaders", () => {
  it("should parse the OTEL-standard comma-separated key=value format", () => {
    expect(
      parseOtlpHeaders(
        "Authorization=Bearer xaat-xxx,X-Axiom-Dataset=my-dataset"
      )
    ).toEqual({
      Authorization: "Bearer xaat-xxx",
      "X-Axiom-Dataset": "my-dataset",
    });
  });

  it("should split each pair on the first equals sign only", () => {
    expect(parseOtlpHeaders("Authorization=Basic a=b=c")).toEqual({
      Authorization: "Basic a=b=c",
    });
  });

  it("should trim whitespace around keys and values", () => {
    expect(parseOtlpHeaders(" a = 1 , b = 2 ")).toEqual({ a: "1", b: "2" });
  });

  it("should accept a JSON object for backward compatibility", () => {
    expect(parseOtlpHeaders('{"Authorization":"Bearer x"}')).toEqual({
      Authorization: "Bearer x",
    });
  });

  it("should reject a pair without a value", () => {
    expect(() => parseOtlpHeaders("Authorization=")).toThrow(MALFORMED_PAIR);
  });

  it("should reject a pair without a key", () => {
    expect(() => parseOtlpHeaders("=value")).toThrow(MALFORMED_PAIR);
  });

  it("should reject JSON that is not an object of strings", () => {
    expect(() => parseOtlpHeaders('{"a":1}')).toThrow(MUST_BE_STRING);
    expect(() => parseOtlpHeaders("{not json")).toThrow();
  });
});
