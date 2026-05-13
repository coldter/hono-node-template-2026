/**
 * Contract tests for the sanitized Better Auth proxy boundary. Two
 * surfaces:
 *  - `sanitizedAuthRequest` — strips proxy-supplied origin headers and
 *    pins `Host` to the resolved tenant.
 *  - `buildAuthProxyMiddleware` — closure factory that returns a Hono
 *    middleware which 404s when no tenant is resolved and otherwise
 *    forwards the cleaned request to the captured BA handler.
 */

import type { Tenant } from "@repo/tenancy";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { createEmptyRequestContext, type Env } from "@/lib/context";
import { handleError } from "@/lib/errors";
import type { AuthInstance } from "@/modules/auth/instance";
import {
  STRIPPED_HEADERS,
  sanitizedAuthRequest,
} from "../../modules/auth/sanitized-request";
import { buildAuthProxyMiddleware } from "../auth-proxy";

const APPLICATION_JSON_RE = /application\/json/;

function makeTenant(overrides: Partial<Tenant> & { host: string }): Tenant {
  return {
    organizationId: "org_1",
    slug: "acme",
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
    ...overrides,
  };
}

describe("STRIPPED_HEADERS", () => {
  it("is an exhaustive, frozen list of the six known proxy-origin headers", () => {
    // Structural assertion: any addition/removal of a proxy header that BA
    // could read must consciously update this list. Catches accidental drift.
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

describe("sanitizedAuthRequest", () => {
  it.each(STRIPPED_HEADERS)("strips %s", (h) => {
    const dirty = new Request(
      "https://acme.app.example.com/api/auth/get-session",
      { headers: { [h]: "evil" } }
    );
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(clean.headers.get(h)).toBeNull();
  });

  it("pins Host to tenant.host", () => {
    const dirty = new Request(
      "https://acme.app.example.com/api/auth/get-session",
      { headers: { Host: "attacker.example" } }
    );
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(clean.headers.get("host")).toBe("acme.app.example.com");
  });

  it("pins Host even when the inbound name uses mixed case", () => {
    // Web Headers is case-insensitive per spec, but verify the strip+pin
    // logic doesn't accidentally leave a duplicate Host slot.
    const dirty = new Request(
      "https://acme.app.example.com/api/auth/get-session",
      { headers: { HoSt: "attacker.example" } }
    );
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(clean.headers.get("host")).toBe("acme.app.example.com");
    expect(clean.headers.get("Host")).toBe("acme.app.example.com");
  });

  it("preserves a JSON body on POST", async () => {
    const dirty = new Request("https://acme.app.example.com/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    });
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(await clean.json()).toEqual({ a: 1 });
  });

  it("preserves method, URL, redirect and referrer", () => {
    const dirty = new Request(
      "https://acme.app.example.com/api/auth/sign-out",
      {
        method: "POST",
        redirect: "manual",
        referrer: "https://acme.app.example.com/login",
      }
    );
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(clean.method).toBe("POST");
    expect(clean.url).toBe("https://acme.app.example.com/api/auth/sign-out");
    expect(clean.redirect).toBe("manual");
    expect(clean.referrer).toBe("https://acme.app.example.com/login");
  });

  it("preserves an empty-body GET without throwing", async () => {
    const dirty = new Request(
      "https://acme.app.example.com/api/auth/get-session",
      { method: "GET" }
    );
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(clean.method).toBe("GET");
    expect(clean.body).toBeNull();
  });

  it("preserves a streaming POST body (ReadableStream)", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"));
        controller.close();
      },
    });
    const dirty = new Request("https://acme.app.example.com/api/auth/sign-in", {
      method: "POST",
      body: stream,
      // boundary: TS lib.dom RequestInit hasn't grown `duplex` yet; undici 7
      // / Node 20+ require it whenever `body` is a `ReadableStream`. Widen
      // the literal locally so the test exercises the streaming-body path.
      ...({ duplex: "half" } as { duplex: "half" }),
    });
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(await clean.text()).toBe("hello");
  });
});

/**
 * boundary: vendor-SDK generic variance — tests only exercise the
 * `.handler` surface of `AuthInstance`; constructing a real BA instance
 * would pull in DB/secret machinery unrelated to the proxy contract.
 * Single cast site for the suite.
 */
function makeFakeAuth(
  handler: (req: Request) => Promise<Response> | Response
): AuthInstance {
  return { handler } as unknown as AuthInstance;
}

describe("buildAuthProxyMiddleware", () => {
  function makeApp(opts: {
    tenant: Tenant | null;
    handler?: (req: Request) => Promise<Response> | Response;
  }) {
    const app = new Hono<Env>();
    const fakeHandler = opts.handler ?? (() => new Response("ok"));
    const fakeAuth = makeFakeAuth(fakeHandler);
    const authFactory = () => fakeAuth;
    const authProxyMiddleware = buildAuthProxyMiddleware(authFactory);
    app.use("*", async (c, next) => {
      c.set("requestContext", {
        ...createEmptyRequestContext(),
        tenant: opts.tenant,
      });
      await next();
    });
    app.all("/api/auth/*", authProxyMiddleware);
    // Match production wiring (see `server.ts`) so 404s flow through the
    // project's standard JSON error envelope.
    app.onError(handleError);
    return app;
  }

  it("returns a JSON 404 error envelope when no tenant is resolved", async () => {
    const app = makeApp({ tenant: null });
    const res = await app.request(
      "http://acme.app.example.com/api/auth/get-session"
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(APPLICATION_JSON_RE);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Not Found");
  });

  it("invokes the captured authFactory with the resolved tenant", async () => {
    const tenant = makeTenant({ host: "acme.app.example.com" });
    const seenTenants: Array<Tenant | null> = [];
    const fakeAuth = makeFakeAuth(() => new Response("ok"));
    const authFactory = (t: Tenant | null) => {
      seenTenants.push(t);
      return fakeAuth;
    };
    const proxy = buildAuthProxyMiddleware(authFactory);
    const app = new Hono<Env>();
    app.use("*", async (c, next) => {
      c.set("requestContext", { ...createEmptyRequestContext(), tenant });
      await next();
    });
    app.all("/api/auth/*", proxy);
    app.onError(handleError);

    await app.request("http://acme.app.example.com/api/auth/get-session");

    expect(seenTenants).toHaveLength(1);
    expect(seenTenants[0]?.host).toBe("acme.app.example.com");
  });

  it("forwards the sanitized request to auth.handler and returns its response verbatim", async () => {
    let observed: Request | null = null;
    const app = makeApp({
      tenant: makeTenant({ host: "acme.app.example.com" }),
      handler: (req) => {
        observed = req;
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: {
            "content-type": "application/json",
            "x-custom": "1",
            "set-cookie": "ba_session=abc; Path=/; HttpOnly",
          },
        });
      },
    });

    const res = await app.request(
      "http://acme.app.example.com/api/auth/get-session",
      {
        headers: {
          "x-forwarded-host": "attacker.example",
          "x-forwarded-proto": "http",
          "x-forwarded-for": "1.2.3.4",
          forwarded: "for=1.2.3.4",
          "cf-connecting-ip": "1.2.3.4",
          "x-real-ip": "1.2.3.4",
          host: "attacker.example",
        },
      }
    );

    // Response is returned verbatim.
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-custom")).toBe("1");
    // Set-Cookie must survive the proxy or BA's session model breaks.
    // Node ≥19.7 (server runs on 25; see apps/server/package.json) exposes
    // `getSetCookie()` which returns each Set-Cookie header individually.
    expect(res.headers.getSetCookie()).toContain(
      "ba_session=abc; Path=/; HttpOnly"
    );
    expect(await res.json()).toEqual({ ok: true });

    // BA handler saw a cleaned request.
    expect(observed).not.toBeNull();
    if (observed === null) {
      throw new Error("observed request was not captured");
    }
    const seen: Request = observed;
    for (const h of STRIPPED_HEADERS) {
      expect(seen.headers.get(h)).toBeNull();
    }
    expect(seen.headers.get("host")).toBe("acme.app.example.com");
  });
});
