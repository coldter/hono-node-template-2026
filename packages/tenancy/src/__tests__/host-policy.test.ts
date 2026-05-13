import { describe, expect, it } from "vitest";
import type { HostConfig } from "../host-config";
import { classifyHost, isReserved } from "../host-policy";

const cfg: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "test",
};

describe("isReserved", () => {
  it("returns true for builtin reserved slugs", () => {
    expect(isReserved("admin")).toBe(true);
    expect(isReserved("api")).toBe(true);
    expect(isReserved("www")).toBe(true);
  });

  it("returns false for arbitrary slugs", () => {
    expect(isReserved("acme")).toBe(false);
    expect(isReserved("tenant-1")).toBe(false);
  });
});

describe("classifyHost", () => {
  it("classifies the admin host", () => {
    expect(classifyHost("admin.example.com", cfg)).toEqual({ kind: "admin" });
  });

  it("classifies the fallback host", () => {
    expect(classifyHost("app.example.com", cfg)).toEqual({ kind: "fallback" });
  });

  it("classifies a subdomain and projects the canonical host", () => {
    expect(classifyHost("acme.app.example.com", cfg)).toEqual({
      kind: "subdomain",
      slug: "acme",
      canonicalHost: "acme.app.example.com",
    });
  });

  it("classifies a reserved-slug subdomain as rejected(reserved_slug)", () => {
    expect(classifyHost("admin.app.example.com", cfg)).toEqual({
      kind: "rejected",
      reason: "reserved_slug",
    });
  });

  it("classifies a custom host", () => {
    expect(classifyHost("app.cust.com", cfg)).toEqual({
      kind: "custom",
      host: "app.cust.com",
    });
  });

  it("propagates parser rejection reasons", () => {
    expect(classifyHost("", cfg)).toEqual({
      kind: "rejected",
      reason: "empty",
    });
    expect(classifyHost("bad_host", cfg)).toEqual({
      kind: "rejected",
      reason: "invalid_chars",
    });
  });
});
