import { createDrizzleClient, readTenantCacheVersion } from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import { createTenancyCache } from "../cache";
import { createFanOutInvalidator } from "../fan-out-invalidator";
import { withTestDb } from "./helpers/with-test-db";

describe("createFanOutInvalidator", () => {
  it("bumpDurable updates tenant_cache_version against the caller's executor", async () => {
    await withTestDb(async (pg) => {
      const db = createDrizzleClient(pg);
      const push = vi.fn().mockResolvedValue(undefined);
      const inv = createFanOutInvalidator({
        hatchet: { events: { push } },
      });
      await db.transaction(async (tx) => {
        await inv.bumpDurable(tx);
      });
      const version = await readTenantCacheVersion(db);
      expect(version).not.toBe("0");
      // bumpDurable must NOT push by itself — broadcast is a separate step.
      expect(push).not.toHaveBeenCalled();
    });
  }, 60_000);

  it("broadcast pushes the host payload, clears the local cache, and never throws on push failure", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const cache = createTenancyCache({});
    const inv = createFanOutInvalidator({
      hatchet: { events: { push } },
      cache,
    });
    await inv.broadcast("acme.app.example.com");
    expect(push).toHaveBeenCalledWith("tenancy.invalidate", {
      host: "acme.app.example.com",
    });
  });

  it("broadcast emits a bump_all payload when no host is supplied", async () => {
    const push = vi.fn().mockResolvedValue(undefined);
    const inv = createFanOutInvalidator({
      hatchet: { events: { push } },
    });
    await inv.broadcast();
    expect(push).toHaveBeenCalledWith("tenancy.invalidate", {
      event: "bump_all",
    });
  });

  it("broadcast swallows hatchet push errors and logs them", async () => {
    const push = vi.fn().mockRejectedValue(new Error("hatchet down"));
    const errorLog = vi.fn();
    const inv = createFanOutInvalidator({
      hatchet: { events: { push } },
      logger: { error: errorLog, info: vi.fn() },
    });
    await expect(inv.broadcast("h")).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "tenancy.invalidate.push_failed" })
    );
  });
});
