/**
 * Behavioural tests for the `requireOperator(action)` Hono adapter.
 *
 * The policy decisions themselves live in `@repo/authorization` and are
 * covered by the matrix-coverage tests there. This file verifies the
 * adapter glue: principal absent -> 401, denied action -> 403, permitted
 * action -> next() runs.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  createEmptyRequestContext,
  type Env,
  type OperatorPrincipal,
} from "@/lib/context";
import { handleError } from "@/lib/errors";
import { requireOperator } from "../require-operator";

function makeApp(principal: OperatorPrincipal | null) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("requestContext", {
      ...createEmptyRequestContext(),
      principal,
    });
    await next();
  });
  app.get("/tenants", requireOperator("tenant.list"), (c) =>
    c.json({ ok: true })
  );
  app.post("/tenants", requireOperator("tenant.create"), (c) =>
    c.json({ ok: true })
  );
  app.onError(handleError);
  return app;
}

const READ_ONLY_RE = /read_only/;
const TENANT_CREATE_RE = /tenant\.create/;

const platformAdmin: OperatorPrincipal = {
  kind: "operator",
  operator: {
    id: "gadmin_1",
    subRole: "platform_admin",
    email: "op@example.com",
  },
};

const readOnly: OperatorPrincipal = {
  kind: "operator",
  operator: {
    id: "gadmin_2",
    subRole: "read_only",
    email: "ro@example.com",
  },
};

describe("requireOperator", () => {
  it("returns 401 when principal is null", async () => {
    const app = makeApp(null);
    const res = await app.request("http://admin.localhost/tenants");
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      error: { code: string };
    };
    // The handler maps cause.code first; auth-context never emits a
    // principal for an unauthenticated request, so the adapter must
    // emit UNAUTHORIZED here.
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("allows a platform_admin to perform tenant.create", async () => {
    const app = makeApp(platformAdmin);
    const res = await app.request("http://admin.localhost/tenants", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("forbids a read_only operator from performing tenant.create", async () => {
    const app = makeApp(readOnly);
    const res = await app.request("http://admin.localhost/tenants", {
      method: "POST",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toMatch(READ_ONLY_RE);
    expect(body.error.message).toMatch(TENANT_CREATE_RE);
  });

  it("allows a read_only operator to perform tenant.list", async () => {
    const app = makeApp(readOnly);
    const res = await app.request("http://admin.localhost/tenants");
    expect(res.status).toBe(200);
  });
});
