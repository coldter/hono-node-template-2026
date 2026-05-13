import { describe, expect, it } from "vitest";
import { withTestDb } from "./helpers/with-test-db";

describe("audit_logs structural invariants", () => {
  it("has zero foreign-key constraints (actor / organization rows outlive hard deletes)", async () => {
    await withTestDb(async (pg) => {
      const result = await pg.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
         WHERE conrelid = 'audit_logs'::regclass AND contype = 'f'`
      );
      expect(result.rows).toEqual([]);
    });
  }, 60_000);
});
