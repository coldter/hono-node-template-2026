import { describe, expect, it } from "vitest";
import { app } from "@/routers/main";

describe("admin-server /ping", () => {
  it("returns 200 with a pong envelope", async () => {
    const res = await app.fetch(
      new Request("http://admin.localhost:3100/ping")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("pong");
  });
});
