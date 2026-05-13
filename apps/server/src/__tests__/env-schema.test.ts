/**
 * Drift-parity contract: `ENV_KEY_SPECS` is the source of truth used by
 * `scripts/setup-env.ts` to render `.env` templates. It must enumerate
 * the exact same key set as the `envSchema` Zod shape, otherwise the
 * generator silently drops keys (operator hits a "missing required env"
 * boot error with no template entry).
 */
import { describe, expect, it } from "vitest";
import { ENV_KEY_SPECS, envSchema } from "../env-schema";

describe("env-schema / ENV_KEY_SPECS parity", () => {
  it("every Zod schema key appears in ENV_KEY_SPECS", () => {
    const zodKeys = Object.keys(envSchema.shape).sort();
    const specKeys = Object.keys(ENV_KEY_SPECS).sort();

    const missingFromSpecs = zodKeys.filter((k) => !specKeys.includes(k));
    expect(
      missingFromSpecs,
      `keys present in envSchema but missing from ENV_KEY_SPECS: ${missingFromSpecs.join(", ")}`
    ).toEqual([]);
  });

  it("every ENV_KEY_SPECS key appears in the Zod schema", () => {
    const zodKeys = Object.keys(envSchema.shape).sort();
    const specKeys = Object.keys(ENV_KEY_SPECS).sort();

    const extraneous = specKeys.filter((k) => !zodKeys.includes(k));
    expect(
      extraneous,
      `keys present in ENV_KEY_SPECS but missing from envSchema: ${extraneous.join(", ")}`
    ).toEqual([]);
  });

  it("every spec marked `default: <value>` has a string default", () => {
    const entries = Object.entries(ENV_KEY_SPECS) as ReadonlyArray<
      readonly [string, { readonly default?: string }]
    >;
    for (const [key, spec] of entries) {
      const defaultValue = spec.default;
      if (defaultValue !== undefined) {
        expect(typeof defaultValue, `${key}.default must be a string`).toBe(
          "string"
        );
      }
    }
  });
});
