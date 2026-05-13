import { describe, expect, it } from "vitest";
import { createDrizzleClient } from "../src/client";
import {
  bumpTenantCacheVersion,
  readTenantCacheVersion,
} from "../src/tenant-cache-version";
import { withTestDb } from "./helpers/with-test-db";

const CHECK_VIOLATION_SQLSTATE = "23514";

describe("tenant-cache-version seam", () => {
  it("bump is monotonic-ish across sequential calls and read reflects the bump", async () => {
    await withTestDb(async (pg) => {
      const db = createDrizzleClient(pg);
      const initial = await readTenantCacheVersion(db);
      const v1 = await bumpTenantCacheVersion(db);
      const r1 = await readTenantCacheVersion(db);
      expect(r1).toBe(v1);
      expect(BigInt(v1)).toBeGreaterThanOrEqual(BigInt(initial));
      // Wait long enough to advance the epoch-seconds clock by at least 1.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const v2 = await bumpTenantCacheVersion(db);
      expect(BigInt(v2)).toBeGreaterThan(BigInt(v1));
    });
  }, 60_000);

  it("rejects inserting a second row (single-row CHECK constraint)", async () => {
    await withTestDb(async (pg) => {
      let caught: unknown;
      try {
        await pg.query(
          `INSERT INTO tenant_cache_version (id, version) VALUES (2, '0')`
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      // boundary: pg error shape is `{ code: string }` at runtime but typed
      // loosely; we read `.code` defensively.
      const code =
        caught && typeof caught === "object" && "code" in caught
          ? (caught as { code: unknown }).code
          : undefined;
      expect(code).toBe(CHECK_VIOLATION_SQLSTATE);
    });
  }, 60_000);
});
