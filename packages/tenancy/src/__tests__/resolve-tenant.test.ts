import { describe, expect, it } from "vitest";
import { createTenancyCache } from "../cache";
import type { HostConfig } from "../host-config";
import { resolveTenant } from "../resolve-tenant";
import { withTestDb } from "./helpers/with-test-db";

const cfg: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "test",
};

const noopWaitUntil = (_: Promise<unknown>): void => undefined;

describe("resolveTenant", () => {
  it("returns tenant for an existing live subdomain", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, session_version) VALUES ('o_1','acme','Acme', 3)`
      );
      const cache = createTenancyCache({});
      const r = await resolveTenant("acme.app.example.com", {
        db: pg,
        cache,
        config: cfg,
        waitUntil: noopWaitUntil,
      });
      expect(r).toMatchObject({
        organizationId: "o_1",
        slug: "acme",
        kind: "subdomain",
        host: "acme.app.example.com",
        sessionVersion: 3,
      });

      // Cached shape must preserve sessionVersion so JWT issuance reads remain
      // version-correct on cache hits.
      const r2 = await resolveTenant("acme.app.example.com", {
        db: pg,
        cache,
        config: cfg,
        waitUntil: noopWaitUntil,
      });
      expect(r2).toMatchObject({ sessionVersion: 3 });
    });
  }, 60_000);

  it("returns not_found and caches negatively for unknown slug", async () => {
    await withTestDb(async (pg) => {
      const cache = createTenancyCache({});
      const r = await resolveTenant("ghost.app.example.com", {
        db: pg,
        cache,
        config: cfg,
        waitUntil: noopWaitUntil,
      });
      expect(r).toEqual({ kind: "not_found", host: "ghost.app.example.com" });
      expect(cache.get("ghost.app.example.com")).toBeDefined();
      const r2 = await resolveTenant("ghost.app.example.com", {
        db: pg,
        cache,
        config: cfg,
        waitUntil: noopWaitUntil,
      });
      expect(r2).toEqual({ kind: "not_found", host: "ghost.app.example.com" });
    });
  }, 60_000);

  it("returns suspended kind for a suspended org", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, suspended_at) VALUES ('o_sus','sus','Sus', now())`
      );
      const cache = createTenancyCache({});
      const r = await resolveTenant("sus.app.example.com", {
        db: pg,
        cache,
        config: cfg,
        waitUntil: noopWaitUntil,
      });
      expect(r.kind).toBe("suspended");
      if (r.kind === "suspended") {
        expect(r.tenant.organizationId).toBe("o_sus");
      }
    });
  }, 60_000);

  it("resolves an active custom hostname via the join", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name) VALUES ('o_cust','cust','Cust')`
      );
      await pg.query(
        `INSERT INTO tenant_custom_hostnames (id, organization_id, hostname, lifecycle_status, verification_token)
         VALUES ('tnh_1','o_cust','app.cust.com','active','vtok_x')`
      );
      const cache = createTenancyCache({});
      const r = await resolveTenant("app.cust.com", {
        db: pg,
        cache,
        config: cfg,
        waitUntil: noopWaitUntil,
      });
      expect(r).toMatchObject({
        organizationId: "o_cust",
        kind: "custom",
        host: "app.cust.com",
        sessionVersion: 0,
      });
    });
  }, 60_000);
});
