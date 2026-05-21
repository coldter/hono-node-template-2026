// Locks the `Vault implements KekWrapper` contract so a rename/signature change
// on `wrap`/`unwrap` is a compile error rather than a silent fake-vault breakage.
import { describe, expect, it } from "vitest";
import { fakeKekWrapper } from "../fake";
import type { KekWrapper } from "../types";
import type { Vault } from "../vault";

describe("Vault / KekWrapper contract", () => {
  it("Vault assigns structurally to KekWrapper", () => {
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
