import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createTenancyCache } from "../cache";
import type { HostConfig } from "../host-config";
import { tenantMiddleware } from "../middleware";
import { withTestDb } from "./helpers/with-test-db";

const cfg: HostConfig = {
  wildcardSuffix: ".app.example.com",
  adminHost: "admin.example.com",
  fallbackHost: "app.example.com",
  nodeEnv: "test",
};
const noopWaitUntil = (_: Promise<unknown>) => undefined;

describe("tenantMiddleware", () => {
  it("404 on unknown subdomain", async () => {
    await withTestDb(async (pg) => {
      const app = new Hono();
      app.use(
        tenantMiddleware({
          db: pg,
          cache: createTenancyCache({}),
          config: cfg,
          waitUntil: noopWaitUntil,
        })
      );
      app.get("/x", (c) => c.text("ok"));
      const res = await app.request("/x", {
        headers: { Host: "ghost.app.example.com" },
      });
      expect(res.status).toBe(404);
    });
  }, 60_000);

  it("503 with Retry-After on suspended tenant", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, suspended_at) VALUES ('o_sus','sus','Sus', now())`
      );
      const app = new Hono();
      app.use(
        tenantMiddleware({
          db: pg,
          cache: createTenancyCache({}),
          config: cfg,
          waitUntil: noopWaitUntil,
        })
      );
      app.get("/x", (c) => c.text("ok"));
      const res = await app.request("/x", {
        headers: { Host: "sus.app.example.com" },
      });
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("60");
    });
  }, 60_000);

  it("200 and sets c.var.tenant on subdomain hit", async () => {
    await withTestDb(async (pg) => {
      await pg.query(
        `INSERT INTO organization (id, slug, name, session_version) VALUES ('o_ok','acme','Acme', 0)`
      );
      const app = new Hono();
      app.use(
        tenantMiddleware({
          db: pg,
          cache: createTenancyCache({}),
          config: cfg,
          waitUntil: noopWaitUntil,
        })
      );
      app.get("/x", (c) => {
        const tenant = c.var.tenant;
        return c.json({
          organizationId: tenant?.organizationId,
          slug: tenant?.slug,
        });
      });
      const res = await app.request("/x", {
        headers: { Host: "acme.app.example.com" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ organizationId: "o_ok", slug: "acme" });
    });
  }, 60_000);
});
