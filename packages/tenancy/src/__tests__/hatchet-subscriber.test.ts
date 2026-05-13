import { describe, expect, it, vi } from "vitest";
import { createTenancyCache } from "../cache";
import { createTenantInvalidationSubscriber } from "../hatchet-subscriber";

describe("createTenantInvalidationSubscriber", () => {
  it("registers a workflow on tenancy.invalidate and the task clears local cache when invoked", async () => {
    const cache = createTenancyCache({});
    cache.set("x.app.example.com", {
      kind: "not_found",
      host: "x.app.example.com",
    });
    expect(cache.size()).toBe(1);

    const registered: {
      wfName?: string;
      eventKey?: string;
      taskFn?: (input: { host?: string }) => Promise<unknown>;
    } = {};

    const fakeHatchet = {
      workflow: (cfg: { name: string; on: { event: string } }) => {
        registered.wfName = cfg.name;
        registered.eventKey = cfg.on.event;
        return {
          task: (taskCfg: {
            name: string;
            fn: (input: { host?: string }) => Promise<unknown>;
          }) => {
            registered.taskFn = taskCfg.fn;
          },
        };
      },
    };

    const info = vi.fn();
    createTenantInvalidationSubscriber({
      hatchet: fakeHatchet,
      cache,
      logger: { info },
    });

    expect(registered.wfName).toBe("tenancy.invalidate");
    expect(registered.eventKey).toBe("tenancy.invalidate");

    expect(registered.taskFn).toBeDefined();
    if (!registered.taskFn) {
      throw new Error("task not registered");
    }
    const result = await registered.taskFn({ host: "x.app.example.com" });
    expect(result).toEqual({ ok: true });
    expect(cache.size()).toBe(0);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "tenancy.invalidate.received",
        host: "x.app.example.com",
      })
    );
  });
});
