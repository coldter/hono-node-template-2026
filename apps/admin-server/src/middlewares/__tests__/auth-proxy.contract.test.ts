/**
 * Contract tests for the sanitized operator auth-proxy boundary.
 *
 * Exercises both the pure `sanitizedOperatorAuthRequest` and the
 * `buildAuthProxyMiddleware` factory. Mirrors the tenant-server's
 * `auth-proxy.contract.test.ts` shape: a hardcoded `STRIPPED_HEADERS` list
 * plus pinning Host to the configured `ADMIN_HOST`.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createEmptyRequestContext, type Env } from "@/lib/context";
import { handleError } from "@/lib/errors";
import type { AdminAuthInstance } from "@/modules/auth/instance";
import {
  buildAuthProxyMiddleware,
  STRIPPED_HEADERS,
  sanitizedOperatorAuthRequest,
} from "../auth-proxy";

const ADMIN_HOST = "admin.localhost";

describe("STRIPPED_HEADERS (operator perimeter)", () => {
  it("is an exhaustive, frozen list of the six known proxy-origin headers", () => {
    expect([...STRIPPED_HEADERS].sort()).toEqual(
      [
        "cf-connecting-ip",
        "forwarded",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
        "x-real-ip",
      ].sort()
    );
    expect(STRIPPED_HEADERS).toHaveLength(6);
  });
});

describe("sanitizedOperatorAuthRequest", () => {
  it.each(STRIPPED_HEADERS)("strips %s", (h) => {
    const dirty = new Request(`https://${ADMIN_HOST}/api/auth/get-session`, {
      headers: { [h]: "evil" },
    });
    const clean = sanitizedOperatorAuthRequest(dirty, ADMIN_HOST);
    expect(clean.headers.get(h)).toBeNull();
  });

  it("pins Host to the admin host", () => {
    const dirty = new Request(`https://${ADMIN_HOST}/api/auth/get-session`, {
      headers: { Host: "attacker.example" },
    });
    const clean = sanitizedOperatorAuthRequest(dirty, ADMIN_HOST);
    expect(clean.headers.get("host")).toBe(ADMIN_HOST);
  });

  it("preserves method, body, redirect and referrer", async () => {
    const dirty = new Request(`https://${ADMIN_HOST}/api/auth/sign-in/email`, {
      method: "POST",
      body: JSON.stringify({ email: "op@example.com", password: "x" }),
      headers: { "content-type": "application/json" },
      redirect: "manual",
      referrer: `https://${ADMIN_HOST}/login`,
    });
    const clean = sanitizedOperatorAuthRequest(dirty, ADMIN_HOST);
    expect(clean.method).toBe("POST");
    expect(clean.redirect).toBe("manual");
    expect(clean.referrer).toBe(`https://${ADMIN_HOST}/login`);
    expect(await clean.json()).toEqual({
      email: "op@example.com",
      password: "x",
    });
  });
});

describe("buildAuthProxyMiddleware", () => {
  function makeApp(handler: (req: Request) => Promise<Response> | Response) {
    // boundary: only `.handler` is exercised by the proxy contract; widen
    // the stub to the full `AdminAuthInstance` shape at this single edge.
    const fakeAuth = { handler } as unknown as AdminAuthInstance;
    const proxy = buildAuthProxyMiddleware({
      authFactory: () => fakeAuth,
      adminHost: ADMIN_HOST,
    });
    const app = new Hono<Env>();
    app.use("*", async (c, next) => {
      c.set("requestContext", createEmptyRequestContext());
      await next();
    });
    app.all("/api/auth/*", proxy);
    app.onError(handleError);
    return app;
  }

  it("forwards the cleaned request to the BA handler and returns its response verbatim", async () => {
    let observed: Request | null = null;
    const app = makeApp((req) => {
      observed = req;
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "content-type": "application/json",
          "set-cookie": "op_session_token_v1=abc; Path=/; HttpOnly",
        },
      });
    });

    const res = await app.request(`http://${ADMIN_HOST}/api/auth/get-session`, {
      headers: {
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
        "x-forwarded-for": "1.2.3.4",
        forwarded: "for=1.2.3.4",
        "cf-connecting-ip": "1.2.3.4",
        "x-real-ip": "1.2.3.4",
        host: "attacker.example",
      },
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.getSetCookie()).toContain(
      "op_session_token_v1=abc; Path=/; HttpOnly"
    );

    expect(observed).not.toBeNull();
    if (observed === null) {
      throw new Error("observed request was not captured");
    }
    const seen: Request = observed;
    for (const h of STRIPPED_HEADERS) {
      expect(seen.headers.get(h)).toBeNull();
    }
    expect(seen.headers.get("host")).toBe(ADMIN_HOST);
  });
});
