/**
 * Locks the `Vault implements KekWrapper` contract.
 *
 * The fake (`fakeKekWrapper`) and the production `Vault` share callers
 * (envelope-encryption codecs) via structural compatibility on `wrap` /
 * `unwrap`. A rename or signature change in the future would silently
 * break the fake. This test makes such drift a compile error.
 */
import { describe, expect, it } from "vitest";
import { fakeKekWrapper } from "../fake";
import type { KekWrapper } from "../types";
import type { Vault } from "../vault";

describe("Vault / KekWrapper contract", () => {
  it("Vault assigns structurally to KekWrapper", () => {
    // Type-level assertion: the cast compiles only if `Vault` exposes
    // `wrap` and `unwrap` with the exact `KekWrapper` signatures.
    type VaultAssignable = Vault extends KekWrapper ? true : false;
    const ok: VaultAssignable = true;
    expect(ok).toBe(true);
  });

  it("fakeKekWrapper round-trips bytes through wrap/unwrap", async () => {
    const fake: KekWrapper = fakeKekWrapper();
    const wrapped = await fake.wrap("hello");
    const unwrapped = await fake.unwrap(wrapped);
    expect(unwrapped.toString("utf8")).toBe("hello");
  });
});
