import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { HostConfig } from "../host-config";
import { hostHeaderGuard } from "../host-header-guard";

const cfg: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "test",
};

describe("hostHeaderGuard", () => {
  it("400 on explicitly empty host header", async () => {
    const app = new Hono();
    app.use(hostHeaderGuard({ config: cfg }));
    app.get("/x", (c) => c.text("ok"));
    const res = await app.request("/x", { headers: { Host: "" } });
    expect(res.status).toBe(400);
  });

  it("400 on host with invalid chars", async () => {
    const app = new Hono();
    app.use(hostHeaderGuard({ config: cfg }));
    app.get("/x", (c) => c.text("ok"));
    const res = await app.request("/x", {
      headers: { Host: "bad_host_with_underscore" },
    });
    expect(res.status).toBe(400);
  });

  it("lets a valid-shape host pass through", async () => {
    const app = new Hono();
    app.use(hostHeaderGuard({ config: cfg }));
    app.get("/x", (c) => c.text("ok"));
    const res = await app.request("/x", {
      headers: { Host: "anything.app.example.com" },
    });
    expect(res.status).toBe(200);
  });
});
