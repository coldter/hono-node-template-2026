import { describe, expect, it } from "vitest";
import {
  redirectSearchSchema,
  resolveRedirectTarget,
  toRedirectParam,
} from "@/lib/redirect-target";

describe("resolveRedirectTarget", () => {
  it("returns a valid same-origin path unchanged", () => {
    expect(resolveRedirectTarget("/dashboard", "/dashboard")).toBe(
      "/dashboard"
    );
  });

  it("returns fallback for undefined", () => {
    expect(resolveRedirectTarget(undefined, "/dashboard")).toBe("/dashboard");
  });

  it("returns fallback for empty string", () => {
    expect(resolveRedirectTarget("", "/dashboard")).toBe("/dashboard");
  });

  it("rejects protocol-relative URL", () => {
    expect(resolveRedirectTarget("//evil.example", "/dashboard")).toBe(
      "/dashboard"
    );
  });

  it("rejects backslash bypass", () => {
    expect(resolveRedirectTarget("/\\evil", "/dashboard")).toBe("/dashboard");
  });

  it("rejects triple slash", () => {
    expect(resolveRedirectTarget("///evil", "/dashboard")).toBe("/dashboard");
  });

  it("rejects absolute https URL", () => {
    expect(resolveRedirectTarget("https://evil.example", "/dashboard")).toBe(
      "/dashboard"
    );
  });

  it("rejects javascript: scheme", () => {
    expect(resolveRedirectTarget("javascript:alert(1)", "/dashboard")).toBe(
      "/dashboard"
    );
  });

  it("rejects data: scheme", () => {
    expect(
      resolveRedirectTarget(
        "data:text/html,<script>alert(1)</script>",
        "/dashboard"
      )
    ).toBe("/dashboard");
  });

  it("preserves path with query and hash", () => {
    expect(resolveRedirectTarget("/foo?x=1#y", "/dashboard")).toBe(
      "/foo?x=1#y"
    );
  });

  it("accepts root path", () => {
    expect(resolveRedirectTarget("/", "/dashboard")).toBe("/");
  });

  it("throws when the fallback itself is unsafe", () => {
    expect(() => resolveRedirectTarget(undefined, "//evil")).toThrow();
  });
});

describe("toRedirectParam", () => {
  it("builds from a DOM Location-like input (hash includes #)", () => {
    expect(
      toRedirectParam({
        pathname: "/foo",
        search: "?x=1",
        hash: "#y",
      })
    ).toBe("/foo?x=1#y");
  });

  it("builds from a ParsedLocation-like input (bare hash, searchStr)", () => {
    expect(
      toRedirectParam({
        pathname: "/foo",
        searchStr: "?x=1",
        hash: "y",
      })
    ).toBe("/foo?x=1#y");
  });

  it("omits hash when absent", () => {
    expect(
      toRedirectParam({
        pathname: "/foo",
        search: "?x=1",
      })
    ).toBe("/foo?x=1");
  });

  it("omits search when absent", () => {
    expect(toRedirectParam({ pathname: "/foo" })).toBe("/foo");
  });

  it("prefers searchStr over search when both present", () => {
    expect(
      toRedirectParam({
        pathname: "/foo",
        searchStr: "?a=1",
        search: "?b=2",
      })
    ).toBe("/foo?a=1");
  });

  it("treats empty hash as no hash", () => {
    expect(
      toRedirectParam({
        pathname: "/foo",
        hash: "",
      })
    ).toBe("/foo");
  });
});

describe("toRedirectParam + resolveRedirectTarget round-trip", () => {
  it("round-trips a router-style location", () => {
    const loc = {
      pathname: "/orgs/acme",
      searchStr: "?tab=members",
      hash: "team",
    };
    const param = toRedirectParam(loc);
    expect(resolveRedirectTarget(param, "/dashboard")).toBe(
      "/orgs/acme?tab=members#team"
    );
  });

  it("round-trips a DOM Location-style input", () => {
    const loc = {
      pathname: "/orgs/acme",
      search: "?tab=members",
      hash: "#team",
    };
    const param = toRedirectParam(loc);
    expect(resolveRedirectTarget(param, "/dashboard")).toBe(
      "/orgs/acme?tab=members#team"
    );
  });
});

describe("redirectSearchSchema", () => {
  it("accepts a valid redirect", () => {
    expect(redirectSearchSchema.parse({ redirect: "/foo?x=1#y" })).toEqual({
      redirect: "/foo?x=1#y",
    });
  });

  it("strips invalid redirect to undefined", () => {
    expect(redirectSearchSchema.parse({ redirect: "//evil" })).toEqual({
      redirect: undefined,
    });
  });

  it("strips javascript: scheme to undefined", () => {
    expect(
      redirectSearchSchema.parse({ redirect: "javascript:alert(1)" })
    ).toEqual({ redirect: undefined });
  });

  it("allows missing redirect", () => {
    expect(redirectSearchSchema.parse({})).toEqual({ redirect: undefined });
  });
});
