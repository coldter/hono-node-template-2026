import type { HostConfig, Tenant } from "@repo/tenancy";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import {
  type AllowedHostsSnapshot,
  buildAllowedHostsSnapshot,
} from "../auth-host-policy";
import { createAuth } from "../instance";
import { createMemoryJtiKillList } from "../jti-kill-list-memory";
import { silentLogger } from "./fixtures/logger";

const HOST_CONFIG: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "test",
};

function makeTenant(host: string): Tenant {
  return {
    organizationId: "org_1",
    slug: "acme",
    host,
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
  };
}

function makeSnapshot(): AllowedHostsSnapshot {
  return buildAllowedHostsSnapshot({
    hostConfig: HOST_CONFIG,
    customHosts: [],
    localDevHosts: ["localhost:3000"],
  });
}

const ALLOWED_HOSTS_ERR_RE = /allowed hosts/i;

function makeDeps(opts: { tenantHost: string }) {
  // Under SKIP_DB=true `db` is an empty stub; BA's allowedHosts check fires before any DB access.
  return {
    db,
    tenant: makeTenant(opts.tenantHost),
    tenantConfig: HOST_CONFIG,
    allowedHostsSnapshot: makeSnapshot(),
    logger: silentLogger(),
    killList: createMemoryJtiKillList(),
  };
}

describe("createAuth allowedHosts", () => {
  it("rejects unknown host via BA handler", async () => {
    const auth = createAuth(makeDeps({ tenantHost: "acme.app.example.com" }));
    await expect(
      auth.handler(new Request("https://attacker.example/api/auth/get-session"))
    ).rejects.toThrow(ALLOWED_HOSTS_ERR_RE);
  });

  it("accepts the resolved tenant host", async () => {
    const auth = createAuth(makeDeps({ tenantHost: "acme.app.example.com" }));
    const res = await auth.handler(
      new Request("https://acme.app.example.com/api/auth/get-session")
    );
    // 421 = Misdirected Request returned on host-validation failure; <500 guards against an allowedHosts regression.
    expect(res.status).not.toBe(421);
    expect(res.status).toBeLessThan(500);
  });
});
