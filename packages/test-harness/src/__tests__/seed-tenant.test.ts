import { createDrizzleClient, readTenantCacheVersion } from "@repo/db";
import { describe, expect, it } from "vitest";
import { seedTenant } from "../seed-tenant";
import { withTestDb } from "./helpers/with-test-db";

const ORG_ID_PREFIX_RE = /^org_/;

describe("seedTenant", () => {
  it("inserts a fresh organization, bumps the cache version, and is idempotent", async () => {
    await withTestDb(async (pg) => {
      const db = createDrizzleClient(pg);

      const beforeVersion = await readTenantCacheVersion(db);

      const first = await seedTenant({
        db,
        slug: "acme",
        sessionVersion: 3,
      });
      expect(first.slug).toBe("acme");
      expect(first.organizationId).toMatch(ORG_ID_PREFIX_RE);
      expect(first.host).toBeUndefined();
      expect(first.sessionVersion).toBe(3);

      const afterFirstVersion = await readTenantCacheVersion(db);
      expect(afterFirstVersion).not.toBe(beforeVersion);

      // Second call with the same slug must return the same id and
      // must not insert a duplicate row.
      const second = await seedTenant({ db, slug: "acme" });
      expect(second.organizationId).toBe(first.organizationId);

      const rows = await pg.query(
        "SELECT id, session_version FROM organization WHERE slug = $1",
        ["acme"]
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]?.id).toBe(first.organizationId);
      expect(Number(rows.rows[0]?.session_version)).toBe(3);
    });
  }, 120_000);

  it("seeds an active custom hostname when withCustomHost is provided", async () => {
    await withTestDb(async (pg) => {
      const db = createDrizzleClient(pg);
      const seed = await seedTenant({
        db,
        slug: "globex",
        withCustomHost: "app.globex.localhost",
      });
      expect(seed.host).toBe("app.globex.localhost");

      const hostRows = await pg.query(
        `SELECT organization_id, lifecycle_status
             FROM tenant_custom_hostnames
            WHERE hostname = $1`,
        ["app.globex.localhost"]
      );
      expect(hostRows.rowCount).toBe(1);
      expect(hostRows.rows[0]?.organization_id).toBe(seed.organizationId);
      expect(hostRows.rows[0]?.lifecycle_status).toBe("active");

      // Re-seeding with the same hostname must not throw or duplicate.
      const again = await seedTenant({
        db,
        slug: "globex",
        withCustomHost: "app.globex.localhost",
      });
      expect(again.organizationId).toBe(seed.organizationId);
      const hostRows2 = await pg.query(
        "SELECT id FROM tenant_custom_hostnames WHERE hostname = $1",
        ["app.globex.localhost"]
      );
      expect(hostRows2.rowCount).toBe(1);
    });
  }, 120_000);
});
