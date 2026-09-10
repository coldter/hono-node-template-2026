import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/context";
import { logger } from "@/lib/logger";

const httpLogger = logger.child({ label: "Http-Request" });
const logSpy = vi.spyOn(httpLogger, "log").mockReturnValue(httpLogger);
vi.spyOn(logger, "child").mockReturnValue(httpLogger);

const { requestLogMiddleware } = await import("@/middlewares/request-log");

function makeApp() {
  const app = new Hono<Env>();
  app.use(requestId());
  app.use(requestLogMiddleware);
  app.get("/api/users/:id", (c) => c.json({ ok: true }));
  app.get("/api/status", (c) => c.json({ status: "ok" }));
  app.get("/boom", () => {
    throw new Error("boom");
  });
  app.onError((_err, c) => c.json({ error: true }, 500));
  return app;
}

beforeEach(() => {
  logSpy.mockClear();
});

describe("requestLogMiddleware", () => {
  it("should log the request shape, level by status, and skip health paths", async () => {
    const app = makeApp();

    const ok = await app.request("/api/users/42");

    expect(ok.status).toBe(200);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "info",
      "request completed",
      expect.objectContaining({
        duration_ms: expect.any(Number),
        method: "GET",
        path: "/api/users/42",
        request_id: expect.any(String),
        route: "/api/users/:id",
        status: 200,
      })
    );

    const boom = await app.request("/boom");

    expect(boom.status).toBe(500);
    expect(logSpy).toHaveBeenLastCalledWith(
      "error",
      "request completed",
      expect.objectContaining({ status: 500 })
    );

    const missing = await app.request("/nope");

    expect(missing.status).toBe(404);
    expect(logSpy).toHaveBeenLastCalledWith(
      "warn",
      "request completed",
      expect.objectContaining({ status: 404 })
    );

    logSpy.mockClear();

    const health = await app.request("/api/status");

    expect(health.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
