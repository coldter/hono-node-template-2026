import { describe, expect, it } from "vitest";
import { generateIdForModel } from "../ids";

const PREFIXED_HEX = /^[a-z0-9]+_[0-9a-f]+$/;
const ENT_ID = /^ent_[0-9a-f]+$/;

const BETTER_AUTH_MODELS = [
  ["account", "acc"],
  ["jwks", "jwk"],
  ["session", "ses"],
  ["twoFactor", "2fa"],
  ["user", "usr"],
  ["verification", "ver"],
] as const;

const UNKNOWN_MODELS = [
  "organization",
  "",
  "toString",
  "constructor",
  "__proto__",
];

describe("generateIdForModel", () => {
  it("maps known models to their prefixes and falls back to ent for unknown and prototype keys", () => {
    for (const [model, prefix] of BETTER_AUTH_MODELS) {
      const id = generateIdForModel(model);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id).toMatch(PREFIXED_HEX);
    }

    expect(generateIdForModel("user")).not.toBe(generateIdForModel("user"));

    for (const model of UNKNOWN_MODELS) {
      expect(generateIdForModel(model)).toMatch(ENT_ID);
    }
  });
});
