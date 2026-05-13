import { describe, expect, it } from "vitest";
import { createTenancyCache } from "../cache";
import type { Tenant } from "../types";

function makeTenant(host: string, id: string): Tenant {
  return {
    organizationId: id,
    slug: host.split(".")[0] ?? null,
    host,
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
  };
}

describe("createTenancyCache", () => {
  it("composes the cache key from the current version and host", () => {
    let v = "v0";
    const cache = createTenancyCache({ version: () => v });
    const tenant = makeTenant("acme.app.example.com", "o_1");
    cache.set("acme.app.example.com", { kind: "found", tenant });
    expect(cache.get("acme.app.example.com")).toEqual({
      kind: "found",
      tenant,
    });

    // Bumping the durable version must invalidate without clearLocal — the
    // cache composes the new version into every lookup so old entries become
    // unreachable instead of needing an explicit purge.
    v = "v1";
    expect(cache.get("acme.app.example.com")).toBeUndefined();
  });

  it("uses a shorter TTL for not_found (negative) entries than for found entries", async () => {
    const cache = createTenancyCache({
      version: () => "v0",
      ttl: 100,
      negativeTtl: 20,
    });
    const tenant = makeTenant("ok.app.example.com", "o_1");
    cache.set("ok.app.example.com", { kind: "found", tenant });
    cache.set("ghost.app.example.com", {
      kind: "not_found",
      host: "ghost.app.example.com",
    });

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(cache.get("ghost.app.example.com")).toBeUndefined();
    expect(cache.get("ok.app.example.com")).toEqual({
      kind: "found",
      tenant,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(cache.get("ok.app.example.com")).toBeUndefined();
  });

  it("isolates entries by host so different hosts do not collide", () => {
    const cache = createTenancyCache({ version: () => "v0" });
    const a = makeTenant("a.app.example.com", "o_a");
    const b = makeTenant("b.app.example.com", "o_b");
    cache.set("a.app.example.com", { kind: "found", tenant: a });
    cache.set("b.app.example.com", { kind: "found", tenant: b });
    expect(cache.get("a.app.example.com")).toEqual({
      kind: "found",
      tenant: a,
    });
    expect(cache.get("b.app.example.com")).toEqual({
      kind: "found",
      tenant: b,
    });
    expect(cache.size()).toBe(2);
  });

  it("clearLocal drops every entry regardless of version or host", () => {
    const cache = createTenancyCache({ version: () => "v0" });
    cache.set("a.app.example.com", {
      kind: "not_found",
      host: "a.app.example.com",
    });
    cache.set("b.app.example.com", {
      kind: "not_found",
      host: "b.app.example.com",
    });
    expect(cache.size()).toBe(2);
    cache.clearLocal();
    expect(cache.size()).toBe(0);
  });
});
