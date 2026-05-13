import type { Env, MiddlewareHandler } from "hono";
import { describe, expect, it } from "vitest";
import { assertChainWellFormed, type ChainEntry } from "../chain";
import {
  COMMON_ENTRY_NAMES,
  commonEntries,
  commonEntriesByName,
} from "../common-entries";

const noop: MiddlewareHandler<Env> = async (_c, next) => {
  await next();
};

function buildEntries(
  extras: {
    corsExtraRequires?: readonly string[];
    auditRequires?: readonly string[];
  } = {}
): ChainEntry<Env>[] {
  return commonEntries<Env>({
    requestContextInit: noop,
    cors: {
      origin: ["http://localhost:3000"],
      extraRequires: extras.corsExtraRequires,
    },
    globalRateLimit: noop,
    auditContextMiddleware: noop,
    auditContextRequires: extras.auditRequires,
  });
}

describe("commonEntries", () => {
  it("returns the expected names in canonical mount order", () => {
    const entries = buildEntries();
    expect(entries.map((e) => e.name)).toEqual([
      "requestContextInit",
      "trimTrailingSlash",
      "httpLogger",
      "cors",
      "globalRateLimit",
      "auditContextMiddleware",
    ]);
  });

  it("passes assertChainWellFormed with default requires", () => {
    const entries = buildEntries();
    expect(() => assertChainWellFormed(entries)).not.toThrow();
  });

  it("respects cors.extraRequires when caller wires app-specific deps", () => {
    // Caller would prepend `tenantMiddleware` etc. before this fragment;
    // we model that by adding a stub entry up front.
    const tenant: ChainEntry<Env> = {
      kind: "use",
      name: "tenantMiddleware",
      mount: noop,
    };
    const entries = buildEntries({
      corsExtraRequires: ["tenantMiddleware"],
    });
    const chain: ChainEntry<Env>[] = [tenant, ...entries];
    expect(() => assertChainWellFormed(chain)).not.toThrow();
    const corsEntry = entries.find((e) => e.name === "cors");
    expect(corsEntry?.requires).toEqual(["tenantMiddleware"]);
  });

  it("returns a fresh array on each call (no shared mutation)", () => {
    const a = buildEntries();
    const b = buildEntries();
    expect(a).not.toBe(b);
    a.push({ kind: "use", name: "extra", mount: noop });
    expect(b.map((e) => e.name)).not.toContain("extra");
  });

  it("audit-context requires request-context-init by default", () => {
    const entries = buildEntries();
    const audit = entries.find((e) => e.name === "auditContextMiddleware");
    expect(audit?.requires).toEqual(["requestContextInit"]);
  });

  it("audit-context requires overrides for server-style chains", () => {
    const entries = buildEntries({
      auditRequires: ["authContextMiddleware"],
    });
    const audit = entries.find((e) => e.name === "auditContextMiddleware");
    expect(audit?.requires).toEqual(["authContextMiddleware"]);
  });
});

describe("commonEntriesByName", () => {
  it("returns one entry per canonical name", () => {
    const byName = commonEntriesByName<Env>({
      requestContextInit: noop,
      cors: { origin: [] },
      globalRateLimit: noop,
      auditContextMiddleware: noop,
    });
    for (const name of COMMON_ENTRY_NAMES) {
      expect(byName[name]).toBeDefined();
      expect(byName[name].name).toBe(name);
    }
  });
});
