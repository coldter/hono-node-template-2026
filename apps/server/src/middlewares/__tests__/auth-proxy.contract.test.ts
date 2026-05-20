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
      // boundary: lib.dom RequestInit lacks `duplex`; undici 7 / Node 20+ require it whenever `body` is a `ReadableStream`.
      ...({ duplex: "half" } as { duplex: "half" }),
    });
    const clean = sanitizedAuthRequest(
      dirty,
      makeTenant({ host: "acme.app.example.com" })
    );
    expect(await clean.text()).toBe("hello");
  });
});

// boundary: vendor-SDK generic variance — tests only exercise `.handler`; constructing a real BA instance would pull in unrelated DB/secret machinery.
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
      c.set("requestContext", createEmptyRequestContext());
      if (opts.tenant) {
        c.set("tenant", opts.tenant);
      }
      await next();
    });
    app.all("/api/auth/*", authProxyMiddleware);
    app.onError(handleError);
    return app;
  }

  it("invokes the captured authFactory with the resolved tenant", async () => {
    const tenant = makeTenant({ host: "acme.app.example.com" });
    const seenTenants: Tenant[] = [];
    const fakeAuth = makeFakeAuth(() => new Response("ok"));
    const authFactory = (t: Tenant) => {
      seenTenants.push(t);
      return fakeAuth;
    };
    const proxy = buildAuthProxyMiddleware(authFactory);
    const app = new Hono<Env>();
    app.use("*", async (c, next) => {
      c.set("requestContext", createEmptyRequestContext());
      c.set("tenant", tenant);
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

    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-custom")).toBe("1");
    // Set-Cookie must survive the proxy or BA's session model breaks.
    expect(res.headers.getSetCookie()).toContain(
      "ba_session=abc; Path=/; HttpOnly"
    );
    expect(await res.json()).toEqual({ ok: true });

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
