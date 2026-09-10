import { describe, expect, it } from "vitest";
import { generateIdForModel, generatePrefixedCuid, ID_PREFIXES } from "../ids";

const LOWER_ALPHANUMERIC = /^[a-z0-9]+$/;
const PREFIXED_HEX = /^[a-z0-9]+_[0-9a-f]+$/;
const USR_ID = /^usr_[0-9a-f]+$/;
const TWO_FACTOR_ID = /^2fa_[0-9a-f]+$/;
const ENT_ID = /^ent_[0-9a-f]+$/;

const BETTER_AUTH_MODEL_PREFIXES = {
  account: ["account", "acc"],
  jwks: ["jwk", "jwk"],
  session: ["session", "ses"],
  twoFactor: ["twoFactor", "2fa"],
  user: ["user", "usr"],
  verification: ["verification", "ver"],
} as const satisfies Record<string, [keyof typeof ID_PREFIXES, string]>;

describe("ID_PREFIXES", () => {
  it("contains only lowercase alphanumeric prefixes", () => {
    for (const prefix of Object.values(ID_PREFIXES)) {
      expect(prefix).toMatch(LOWER_ALPHANUMERIC);
    }
  });

  it("registers the prefixes used by ids.ts", () => {
    expect(ID_PREFIXES.jwk).toBe("jwk");
    expect(ID_PREFIXES.twoFactor).toBe("2fa");
    expect(ID_PREFIXES.notificationPreference).toBe("ntfp");
  });
});

describe("generatePrefixedCuid", () => {
  it("returns an id shaped as <prefix>_<hex>", () => {
    expect(generatePrefixedCuid("usr")).toMatch(USR_ID);
    expect(generatePrefixedCuid(ID_PREFIXES.twoFactor)).toMatch(TWO_FACTOR_ID);
  });
});

describe("generateIdForModel", () => {
  it("registers the expected prefix for every Better Auth model", () => {
    for (const [key, prefix] of Object.values(BETTER_AUTH_MODEL_PREFIXES)) {
      expect(ID_PREFIXES[key]).toBe(prefix);
    }
  });

  it("maps every Better Auth model to a registered prefix", () => {
    for (const [model, [, prefix]] of Object.entries(
      BETTER_AUTH_MODEL_PREFIXES
    )) {
      const id = generateIdForModel(model);
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id).toMatch(PREFIXED_HEX);
    }
  });

  it("falls back to the ent prefix for unknown models", () => {
    expect(generateIdForModel("organization")).toMatch(ENT_ID);
    expect(generateIdForModel("")).toMatch(ENT_ID);
  });
});
