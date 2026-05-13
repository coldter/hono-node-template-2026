import type { HostConfig, Tenant } from "@repo/tenancy";
import { describe, expect, it } from "vitest";
import {
  type AllowedHostsSnapshot,
  buildAllowedHostsSnapshot,
  buildAuthHostPolicy,
} from "../auth-host-policy";

const HOST_CONFIG: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "test",
};

const BASE_SNAPSHOT: AllowedHostsSnapshot = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  customHosts: ["tenant-custom.com"],
  localDevHosts: ["localhost:3000", "127.0.0.1:3000"],
  nodeEnv: "development",
};

const TENANT: Tenant = {
  organizationId: "org_1",
  slug: "acme",
  host: "acme.app.example.com",
  kind: "subdomain",
  enforceSSO: false,
  sessionVersion: 0,
  suspendedAt: null,
  deletedAt: null,
  branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
};

const CUSTOM_TENANT: Tenant = {
  organizationId: "org_2",
  slug: null,
  host: "tenant.custom.com",
  kind: "custom",
  enforceSSO: false,
  sessionVersion: 0,
  suspendedAt: null,
  deletedAt: null,
  branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
};

function makeReq(host: string): Request {
  return new Request(`https://${host}/api/auth/ok`);
}

describe("buildAllowedHostsSnapshot", () => {
  it("normalises wildcardSuffix missing the leading dot", () => {
    const snap = buildAllowedHostsSnapshot({
      hostConfig: { ...HOST_CONFIG, wildcardSuffix: "app.example.com" },
    });
    expect(snap.wildcardSuffix).toBe(".app.example.com");
  });
});

describe("AuthHostPolicy.allowedHosts (snapshot derivation)", () => {
  it("includes apex, wildcard, admin, custom hosts in all envs", () => {
    const policy = buildAuthHostPolicy({
      snapshot: BASE_SNAPSHOT,
      tenant: null,
      tenantConfig: HOST_CONFIG,
    });
    expect(policy.allowedHosts).toEqual(
      expect.arrayContaining([
        "app.example.com",
        "*.app.example.com",
        "admin.example.com",
        "tenant-custom.com",
      ])
    );
  });

  it("includes localDevHosts in development", () => {
    const policy = buildAuthHostPolicy({
      snapshot: { ...BASE_SNAPSHOT, nodeEnv: "development" },
      tenant: null,
      tenantConfig: HOST_CONFIG,
    });
    expect(policy.allowedHosts).toEqual(
      expect.arrayContaining(["localhost:3000", "127.0.0.1:3000"])
    );
  });

  it("includes localDevHosts in test", () => {
    const policy = buildAuthHostPolicy({
      snapshot: { ...BASE_SNAPSHOT, nodeEnv: "test" },
      tenant: null,
      tenantConfig: HOST_CONFIG,
    });
    expect(policy.allowedHosts).toEqual(
      expect.arrayContaining(["localhost:3000", "127.0.0.1:3000"])
    );
  });

  it("drops localDevHosts in production", () => {
    const policy = buildAuthHostPolicy({
      snapshot: { ...BASE_SNAPSHOT, nodeEnv: "production" },
      tenant: null,
      tenantConfig: HOST_CONFIG,
    });
    expect(policy.allowedHosts).not.toContain("localhost:3000");
    expect(policy.allowedHosts).not.toContain("127.0.0.1:3000");
  });

  it("derives an apex correctly when the wildcard suffix has no leading dot", () => {
    const policy = buildAuthHostPolicy({
      snapshot: { ...BASE_SNAPSHOT, wildcardSuffix: "app.example.com" },
      tenant: null,
      tenantConfig: HOST_CONFIG,
    });
    // No leading dot to strip — apex equals the suffix itself.
    expect(policy.allowedHosts).toContain("app.example.com");
    expect(policy.allowedHosts).toContain("*app.example.com");
  });
});

describe("AuthHostPolicy.allowedHosts — tenant-append rule", () => {
  it("appends the resolved tenant host when not already present", () => {
    const tenantOnExoticHost: Tenant = {
      ...TENANT,
      host: "tenant-not-in-snapshot.example",
    };
    const policy = buildAuthHostPolicy({
      snapshot: BASE_SNAPSHOT,
      tenant: tenantOnExoticHost,
      tenantConfig: HOST_CONFIG,
    });
    expect(policy.allowedHosts).toContain("tenant-not-in-snapshot.example");
  });

  it("does not duplicate when the tenant host is already in the snapshot", () => {
    const snapshotWithTenant: AllowedHostsSnapshot = {
      ...BASE_SNAPSHOT,
      customHosts: ["tenant.custom.com"],
    };
    const policy = buildAuthHostPolicy({
      snapshot: snapshotWithTenant,
      tenant: CUSTOM_TENANT,
      tenantConfig: HOST_CONFIG,
    });
    const occurrences = policy.allowedHosts.filter(
      (h) => h === "tenant.custom.com"
    ).length;
    expect(occurrences).toBe(1);
  });

  it("omits the tenant entry when tenant is null", () => {
    const policy = buildAuthHostPolicy({
      snapshot: BASE_SNAPSHOT,
      tenant: null,
      tenantConfig: HOST_CONFIG,
    });
    expect(policy.allowedHosts).not.toContain("acme.app.example.com");
  });
});

describe("AuthHostPolicy.trustedOrigins", () => {
  describe("undefined request", () => {
    it("returns an empty array", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: TENANT,
        tenantConfig: HOST_CONFIG,
        extraTrustedOrigins: ["https://admin.example.com"],
      });
      const result = await policy.trustedOrigins(undefined);
      expect(result).toEqual([]);
    });
  });

  describe("subdomain host", () => {
    it("returns the tenant origin (plus extras) when tenant resolved", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: TENANT,
        tenantConfig: HOST_CONFIG,
        extraTrustedOrigins: ["https://admin.example.com"],
      });
      const result = await policy.trustedOrigins(
        makeReq("acme.app.example.com")
      );
      expect(result).toEqual([
        "https://acme.app.example.com",
        "https://admin.example.com",
      ]);
    });

    it("returns only extras when tenant is null on subdomain", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: null,
        tenantConfig: HOST_CONFIG,
        extraTrustedOrigins: ["https://admin.example.com"],
      });
      const result = await policy.trustedOrigins(
        makeReq("acme.app.example.com")
      );
      expect(result).toEqual(["https://admin.example.com"]);
    });
  });

  describe("custom host", () => {
    it("returns the tenant origin when resolved", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: CUSTOM_TENANT,
        tenantConfig: HOST_CONFIG,
      });
      const result = await policy.trustedOrigins(makeReq("tenant.custom.com"));
      expect(result).toEqual(["https://tenant.custom.com"]);
    });
  });

  describe("admin host", () => {
    it("returns only extras (no tenant origin) on admin", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: null,
        tenantConfig: HOST_CONFIG,
        extraTrustedOrigins: ["https://admin.example.com"],
      });
      const result = await policy.trustedOrigins(makeReq("admin.example.com"));
      expect(result).toEqual(["https://admin.example.com"]);
    });

    it("returns an empty array on admin with no extras", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: null,
        tenantConfig: HOST_CONFIG,
      });
      const result = await policy.trustedOrigins(makeReq("admin.example.com"));
      expect(result).toEqual([]);
    });
  });

  describe("fallback host", () => {
    it("returns only extras on the fallback host", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: BASE_SNAPSHOT,
        tenant: null,
        tenantConfig: HOST_CONFIG,
        extraTrustedOrigins: ["https://admin.example.com"],
      });
      const result = await policy.trustedOrigins(makeReq("app.example.com"));
      expect(result).toEqual(["https://admin.example.com"]);
    });
  });

  describe("production env (parity)", () => {
    it("derives the tenant origin identically in production", async () => {
      const policy = buildAuthHostPolicy({
        snapshot: { ...BASE_SNAPSHOT, nodeEnv: "production" },
        tenant: TENANT,
        tenantConfig: { ...HOST_CONFIG, nodeEnv: "production" },
      });
      const result = await policy.trustedOrigins(
        makeReq("acme.app.example.com")
      );
      expect(result).toEqual(["https://acme.app.example.com"]);
    });
  });
});
