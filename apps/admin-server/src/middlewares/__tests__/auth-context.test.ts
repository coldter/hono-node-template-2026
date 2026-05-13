/**
 * Behavioural tests for the operator auth-context middleware.
 *
 * Concerns exercised:
 *   - A valid operator session yields a populated principal.
 *   - No session yields `principal = null`.
 *   - A session missing the operator additional-fields yields
 *     `principal = null` (defense-in-depth around the BA gate).
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createEmptyRequestContext,
  type Env,
  type RequestContext,
} from "@/lib/context";
import type { AdminAuthInstance } from "@/modules/auth/instance";
import { buildAuthContextMiddleware } from "../auth-context";

type FakeSession = {
  user: { id: string; email: string };
  session: {
    id: string;
    operatorId?: string;
    operatorSubRole?: string;
  };
} | null;

function makeApp(session: FakeSession) {
  // boundary: BA's `AdminAuthInstance` is a deeply-nested betterAuth return
  // type; tests only exercise `.api.getSession`. Stub the consumed surface
  // and widen to the full instance shape at this single edge.
  const fakeAuth = {
    api: {
      getSession: async () => session,
    },
  } as unknown as AdminAuthInstance;

  const middleware = buildAuthContextMiddleware(() => fakeAuth);

  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("requestContext", createEmptyRequestContext());
    await next();
  });
  app.use("*", middleware);
  app.get("/probe", (c) => {
    const ctx: RequestContext = c.var.requestContext;
    return c.json({ principal: ctx.principal });
  });
  return app;
}

describe("buildAuthContextMiddleware", () => {
  it("sets principal=null when no session is present", async () => {
    const app = makeApp(null);
    const res = await app.request("http://admin.localhost/probe");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { principal: unknown };
    expect(body.principal).toBeNull();
  });

  it("populates principal for a valid operator session", async () => {
    const app = makeApp({
      user: { id: "user_op_1", email: "op@example.com" },
      session: {
        id: "sess_1",
        operatorId: "gadmin_1",
        operatorSubRole: "platform_admin",
      },
    });
    const res = await app.request("http://admin.localhost/probe");
    const body = (await res.json()) as {
      principal: {
        kind: string;
        operator: { id: string; subRole: string; email: string };
      };
    };
    expect(body.principal).toEqual({
      kind: "operator",
      operator: {
        id: "gadmin_1",
        subRole: "platform_admin",
        email: "op@example.com",
      },
    });
  });

  it("returns principal=null when the session lacks operator fields", async () => {
    // Models a defense-in-depth case: even if a session somehow survived
    // without the operator additional-fields, the middleware must not
    // treat it as authenticated.
    const app = makeApp({
      user: { id: "user_1", email: "regular@example.com" },
      session: { id: "sess_2" },
    });
    const res = await app.request("http://admin.localhost/probe");
    const body = (await res.json()) as { principal: unknown };
    expect(body.principal).toBeNull();
  });

  it("returns principal=null when subRole is not a known operator role", async () => {
    const app = makeApp({
      user: { id: "user_2", email: "weird@example.com" },
      session: {
        id: "sess_3",
        operatorId: "gadmin_2",
        operatorSubRole: "tenant_admin",
      },
    });
    const res = await app.request("http://admin.localhost/probe");
    const body = (await res.json()) as { principal: unknown };
    expect(body.principal).toBeNull();
  });
});
