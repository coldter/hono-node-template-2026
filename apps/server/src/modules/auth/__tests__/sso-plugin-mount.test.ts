// Proves the BA sso plugin mounts cleanly. `/sso/register` is disabled via
// `disabledPaths` (our schema is incompatible with BA's `oidcConfig` text
// column — see the long comment on `sso(...)` in `instance.ts`). Anything
// < 500 proves the plugin didn't blow up on init.

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

const TENANT_HOST = "acme.app.example.com";

function makeTenant(): Tenant {
  return {
    organizationId: "org_1",
    slug: "acme",
    host: TENANT_HOST,
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

function makeDeps() {
  return {
    db,
    tenant: makeTenant(),
    tenantConfig: HOST_CONFIG,
    allowedHostsSnapshot: makeSnapshot(),
    logger: silentLogger(),
    killList: createMemoryJtiKillList(),
  };
}

describe("createAuth: @better-auth/sso plugin mount (A4.3)", () => {
  it("routes /api/auth/sso/register without a 5xx (disabled via disabledPaths)", async () => {
    const auth = createAuth(makeDeps());
    const res = await auth.handler(
      new Request(`https://${TENANT_HOST}/api/auth/sso/register`, {
        method: "OPTIONS",
      })
    );
    // disabledPaths returns a 404 for the path. Anything < 500 proves the
    // plugin mounted cleanly and didn't blow up on import or init.
    expect(res.status).toBeLessThan(500);
  });

  it("routes /api/auth/sso/sign-in without a 5xx (plugin mounted)", async () => {
    const auth = createAuth(makeDeps());
    const res = await auth.handler(
      new Request(`https://${TENANT_HOST}/api/auth/sign-in/sso`, {
        method: "OPTIONS",
      })
    );
    expect(res.status).toBeLessThan(500);
  });
});
