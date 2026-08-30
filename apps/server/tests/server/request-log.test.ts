import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/lib/context";

const logSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ log: logSpy }),
  },
}));

import { requestLogMiddleware } from "@/middlewares/request-log";

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
  it("should emit one structured line per completed request", async () => {
    const res = await makeApp().request("/api/users/42");

    expect(res.status).toBe(200);
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
  });

  it("should log at error level for 5xx responses", async () => {
    const res = await makeApp().request("/boom");

    expect(res.status).toBe(500);
    expect(logSpy).toHaveBeenCalledWith(
      "error",
      "request completed",
      expect.objectContaining({ status: 500 })
    );
  });

  it("should log at warn level for 4xx responses", async () => {
    const res = await makeApp().request("/nope");

    expect(res.status).toBe(404);
    expect(logSpy).toHaveBeenCalledWith(
      "warn",
      "request completed",
      expect.objectContaining({ status: 404 })
    );
  });

  it("should skip healthcheck paths entirely", async () => {
    const res = await makeApp().request("/api/status");

    expect(res.status).toBe(200);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
