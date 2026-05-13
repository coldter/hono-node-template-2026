import { describe, expect, it } from "vitest";
import { resolveDevTenantHeader } from "../dev-header";
import type { HostConfig } from "../host-config";

const baseCfg: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "development",
};

describe("resolveDevTenantHeader", () => {
  it("rewrites slug to host when env+flag allow", () => {
    expect(resolveDevTenantHeader("acme", baseCfg, "1")).toEqual({
      kind: "rewrite",
      host: "acme.app.example.com",
    });
  });

  it("ignored when production", () => {
    expect(
      resolveDevTenantHeader("acme", { ...baseCfg, nodeEnv: "production" }, "1")
    ).toEqual({ kind: "ignored", reason: "production" });
  });

  it("ignored when flag unset", () => {
    expect(resolveDevTenantHeader("acme", baseCfg, undefined)).toEqual({
      kind: "ignored",
      reason: "env_flag_unset",
    });
  });

  it("ignored when flag is anything but 1", () => {
    expect(resolveDevTenantHeader("acme", baseCfg, "0")).toEqual({
      kind: "ignored",
      reason: "env_flag_unset",
    });
  });

  it("ignored for reserved slug", () => {
    expect(resolveDevTenantHeader("admin", baseCfg, "1")).toEqual({
      kind: "ignored",
      reason: "reserved",
    });
  });

  it("ignored for invalid slug shape", () => {
    expect(resolveDevTenantHeader("-bad-", baseCfg, "1")).toEqual({
      kind: "ignored",
      reason: "slug_format",
    });
  });

  it("lowercases input", () => {
    expect(resolveDevTenantHeader("Acme", baseCfg, "1")).toEqual({
      kind: "rewrite",
      host: "acme.app.example.com",
    });
  });
});
