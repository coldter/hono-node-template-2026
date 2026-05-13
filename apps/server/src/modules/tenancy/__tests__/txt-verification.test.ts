// Behavioural tests for the TXT verification helper. The resolver is
// injected, so tests never touch the network. The chunk-join behaviour
// (TXT records >255 bytes are returned as multiple string chunks per
// record) is exercised so the join survives accidental regressions.

import { describe, expect, it, vi } from "vitest";

import { verifyTxtRecord } from "@/modules/tenancy/txt-verification";

const LABEL = "_app-verify";
const HOSTNAME = "tenant.example.com";
const EXPECTED = "vtok_abc123";

describe("verifyTxtRecord", () => {
  it("returns { ok: true } when a record matches the expected token", async () => {
    const resolveTxt = vi.fn().mockResolvedValue([[EXPECTED]]);
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: true });
    expect(resolveTxt).toHaveBeenCalledWith(`${LABEL}.${HOSTNAME}`);
  });

  it("joins multi-chunk records before comparing", async () => {
    const resolveTxt = vi.fn().mockResolvedValue([["vtok_", "abc123"]]);
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns no_record when the resolver returns an empty array", async () => {
    const resolveTxt = vi.fn().mockResolvedValue([]);
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: false, reason: "no_record" });
  });

  it("returns no_record when the resolver throws ENOTFOUND (NXDOMAIN)", async () => {
    const err = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    const resolveTxt = vi.fn().mockRejectedValue(err);
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: false, reason: "no_record" });
  });

  it("returns no_record when the resolver throws ENODATA", async () => {
    const err = Object.assign(new Error("no data"), { code: "ENODATA" });
    const resolveTxt = vi.fn().mockRejectedValue(err);
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: false, reason: "no_record" });
  });

  it("returns mismatch when records exist but none equal the expected token", async () => {
    const resolveTxt = vi
      .fn()
      .mockResolvedValue([["vtok_other"], ["something_else"]]);
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: false, reason: "mismatch" });
  });

  it("returns resolver_error on any non-DNS-miss throw", async () => {
    const resolveTxt = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await verifyTxtRecord(HOSTNAME, EXPECTED, {
      resolveTxt,
      label: LABEL,
    });
    expect(result).toEqual({ ok: false, reason: "resolver_error" });
  });
});
