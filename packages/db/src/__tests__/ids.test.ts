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

describe("generateIdForModel", () => {
  it("maps every Better Auth model to a registered prefix", () => {
    for (const [model, prefix] of BETTER_AUTH_MODELS) {
      const id = generateIdForModel(model);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id).toMatch(PREFIXED_HEX);
    }
  });

  it("falls back to the ent prefix for unknown models", () => {
    expect(generateIdForModel("organization")).toMatch(ENT_ID);
    expect(generateIdForModel("")).toMatch(ENT_ID);
  });

  it("ignores inherited prototype members when resolving prefixes", () => {
    expect(generateIdForModel("toString")).toMatch(ENT_ID);
    expect(generateIdForModel("constructor")).toMatch(ENT_ID);
    expect(generateIdForModel("__proto__")).toMatch(ENT_ID);
  });
});
