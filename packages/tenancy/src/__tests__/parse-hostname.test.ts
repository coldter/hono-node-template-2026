import { describe, expect, it } from "vitest";
import type { HostConfig } from "../host-config";
import { parseHostname, SLUG_RE } from "../parse-hostname";

const cfg: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "development",
};

describe("parseHostname", () => {
  it("empty host", () => {
    expect(parseHostname("", cfg)).toEqual({
      kind: "rejected",
      reason: "empty",
    });
  });
  it("strips port", () => {
    expect(parseHostname("acme.app.example.com:8080", cfg)).toEqual({
      kind: "subdomain",
      slug: "acme",
    });
  });
  it("strips trailing dot", () => {
    expect(parseHostname("acme.app.example.com.", cfg)).toEqual({
      kind: "subdomain",
      slug: "acme",
    });
  });
  it("strips multiple trailing dots so wildcard match still applies", () => {
    expect(parseHostname("acme.app.example.com..", cfg)).toEqual(
      parseHostname("acme.app.example.com", cfg)
    );
  });
  it("normalizes mixed case", () => {
    expect(parseHostname("Acme.App.Example.COM", cfg)).toEqual({
      kind: "subdomain",
      slug: "acme",
    });
  });
  it("admin host", () => {
    expect(parseHostname("admin.example.com", cfg)).toEqual({ kind: "admin" });
  });
  it("fallback host", () => {
    expect(parseHostname("app.example.com", cfg)).toEqual({ kind: "fallback" });
  });
  it("nested subdomain rejected", () => {
    expect(parseHostname("a.b.app.example.com", cfg)).toEqual({
      kind: "rejected",
      reason: "nested_subdomain",
    });
  });
  it("punycode under wildcard rejected", () => {
    expect(parseHostname("xn--mnchen-3ya.app.example.com", cfg)).toEqual({
      kind: "rejected",
      reason: "punycode",
    });
  });
  it("punycode custom host accepted", () => {
    expect(parseHostname("xn--bcher-kva.example", cfg)).toEqual({
      kind: "custom",
      host: "xn--bcher-kva.example",
    });
  });
  it("slug regex: leading hyphen rejected", () => {
    expect(parseHostname("-bad.app.example.com", cfg)).toEqual({
      kind: "rejected",
      reason: "slug_format",
    });
  });
  it("slug regex: trailing hyphen rejected", () => {
    expect(parseHostname("bad-.app.example.com", cfg)).toEqual({
      kind: "rejected",
      reason: "slug_format",
    });
  });
  it("slug regex: single char accepted", () => {
    expect(parseHostname("a.app.example.com", cfg)).toEqual({
      kind: "subdomain",
      slug: "a",
    });
  });
  it("invalid chars rejected", () => {
    expect(parseHostname("bad_slug.app.example.com", cfg)).toEqual({
      kind: "rejected",
      reason: "invalid_chars",
    });
  });
  it("custom host accepted", () => {
    expect(parseHostname("app.acme.com", cfg)).toEqual({
      kind: "custom",
      host: "app.acme.com",
    });
  });
  it("subdomain that matches a reserved slug still returns subdomain kind (callers consult BUILTIN_RESERVED_SLUGS separately)", () => {
    expect(parseHostname("admin.app.example.com", cfg)).toEqual({
      kind: "subdomain",
      slug: "admin",
    });
  });
  it("port-only host after stripping yields empty", () => {
    expect(parseHostname(":8080", cfg)).toEqual({
      kind: "rejected",
      reason: "empty",
    });
  });
  it("admin host with port is still recognized as admin", () => {
    expect(parseHostname("admin.example.com:443", cfg)).toEqual({
      kind: "admin",
    });
  });
  it("fallback host with trailing dot is still recognized as fallback", () => {
    expect(parseHostname("app.example.com.", cfg)).toEqual({
      kind: "fallback",
    });
  });
});

describe("SLUG_RE", () => {
  it("accepts 63-char max", () =>
    expect(SLUG_RE.test("a".repeat(63))).toBe(true));
  it("rejects 64-char", () => expect(SLUG_RE.test("a".repeat(64))).toBe(false));
});
