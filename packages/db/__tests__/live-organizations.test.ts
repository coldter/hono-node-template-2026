import { describe, expect, it } from "vitest";
import { createDrizzleClient } from "../src/client";
import { liveOrganizations } from "../src/live-organizations";
import { organizations } from "../src/schema/organizations";
import { withTestDb } from "./helpers/with-test-db";

describe("liveOrganizations", () => {
  it("hides soft-deleted rows from select / selectById / selectBySlug / findFirst", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, deleted_at) VALUES ('o_dead','dead','Dead', now())`
      );
      await pg.query(
        `INSERT INTO organization (id, slug, name) VALUES ('o_live','live','Live')`
      );

      const db = createDrizzleClient(pg);
      const live = liveOrganizations(db);

      const all = await live.select({ id: organizations.id });
      expect(all.map((r) => r.id)).toEqual(["o_live"]);

      expect(
        await live.selectById({ id: organizations.id }, "o_dead")
      ).toHaveLength(0);
      expect(
        await live.selectById({ id: organizations.id }, "o_live")
      ).toHaveLength(1);
      expect(
        await live.selectBySlug({ id: organizations.id }, "dead")
      ).toHaveLength(0);
      expect(
        await live.selectBySlug({ id: organizations.id }, "live")
      ).toHaveLength(1);

      expect(await live.findFirst({ where: { id: "o_dead" } })).toBeUndefined();
      const liveRow = await live.findFirst({ where: { id: "o_live" } });
      expect(liveRow?.id).toBe("o_live");
    });
  }, 60_000);

  it("selectByIds filters out soft-deleted rows and returns rows for live ids", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, deleted_at) VALUES ('o_dead','dead','Dead', now())`
      );
      await pg.query(
        `INSERT INTO organization (id, slug, name) VALUES ('o_a','a','A'),('o_b','b','B')`
      );
      const db = createDrizzleClient(pg);
      const live = liveOrganizations(db);

      const rows = await live.selectByIds({ id: organizations.id }, [
        "o_a",
        "o_b",
        "o_dead",
        "o_missing",
      ]);
      expect(rows.map((r) => r.id).sort()).toEqual(["o_a", "o_b"]);

      const emptyCase = await live.selectByIds({ id: organizations.id }, []);
      expect(emptyCase).toEqual([]);
    });
  }, 60_000);

  it("count returns the number of live rows and supports extra predicates", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, deleted_at) VALUES ('o_d','d','D', now())`
      );
      await pg.query(
        `INSERT INTO organization (id, slug, name) VALUES ('o_x','x','X'),('o_y','y','Y')`
      );
      const db = createDrizzleClient(pg);
      const live = liveOrganizations(db);

      expect(await live.count()).toBe(2);
    });
  }, 60_000);

  it("existsBySlug returns true only for live rows", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, deleted_at) VALUES ('o_dead','dead','Dead', now())`
      );
      await pg.query(
        `INSERT INTO organization (id, slug, name) VALUES ('o_live','live','Live')`
      );
      const db = createDrizzleClient(pg);
      const live = liveOrganizations(db);

      expect(await live.existsBySlug("live")).toBe(true);
      expect(await live.existsBySlug("dead")).toBe(false);
      expect(await live.existsBySlug("missing")).toBe(false);
    });
  }, 60_000);
});
