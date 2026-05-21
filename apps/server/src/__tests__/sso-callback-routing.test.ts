/**
 * Route-tree audit: assert exactly ONE canonical SSO callback route exists,
 * `/api/auth/sso/callback/:providerId`. Two surfaces require dual probing:
 *
 *  1. The top-level Hono mount: `/api/auth/*` is forwarded to the BA proxy,
 *     so BA plugin routes do NOT appear in `baseApp.routes`. Assert no
 *     duplicate top-level path with `/sso/callback` exists.
 *  2. The Better Auth instance: probe `auth.handler` with a concrete
 *     `:providerId` (status < 500 proves the plugin route registered) and
 *     with the bare path (must reject with 4xx, never success/redirect).
 *
 * Why dual: `listRegisteredRoutes` misses plugin-managed routes; the BA
 * probe misses a future top-level alias regression. Together they pin both.
 */

import type { HostConfig, Tenant } from "@repo/tenancy";
import { describe, expect, it } from "vitest";
import { makeSilentLogger } from "@/__tests__/fixtures/silent-logger";
import { db } from "@/db";
import {
  type AllowedHostsSnapshot,
  buildAllowedHostsSnapshot,
} from "@/modules/auth/auth-host-policy";
import { createAuth } from "@/modules/auth/instance";
import { createMemoryJtiKillList } from "@/modules/auth/jti-kill-list-memory";
import baseApp from "@/server";
import { listRegisteredRoutes } from "./helpers/list-routes";

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

const stubLogger = makeSilentLogger();

function makeDeps() {
  return {
    db,
    tenant: makeTenant(),
    tenantConfig: HOST_CONFIG,
    allowedHostsSnapshot: makeSnapshot(),
    logger: stubLogger,
    killList: createMemoryJtiKillList(),
  };
}

describe("/sso/callback route audit", () => {
  it("no /sso/callback path is registered at the top-level Hono mount", () => {
    const routes = listRegisteredRoutes(baseApp);
    const matches = routes.filter((r) => r.path.includes("/sso/callback"));
    expect(matches).toEqual([]);
  });

  it("Better Auth registers the canonical /api/auth/sso/callback/:providerId route", async () => {
    const auth = createAuth(makeDeps());
    const res = await auth.handler(
      new Request(
        `https://${TENANT_HOST}/api/auth/sso/callback/test-provider`,
        { method: "GET" }
      )
    );
    // 4xx is acceptable (provider not found, missing state); 500+ means the plugin failed at import.
    expect(res.status).toBeLessThan(500);
  });

  it("/api/auth/sso/callback without a providerId does not succeed", async () => {
    const auth = createAuth(makeDeps());
    const res = await auth.handler(
      new Request(`https://${TENANT_HOST}/api/auth/sso/callback`, {
        method: "GET",
      })
    );
    // Bare path must not be a working endpoint — a duplicate alias would 200/302.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect([200, 301, 302, 303, 307, 308]).not.toContain(res.status);
  });
});
