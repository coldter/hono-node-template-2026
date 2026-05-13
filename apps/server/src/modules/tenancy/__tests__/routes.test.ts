/**
 * Behavioural tests for `/api/tenancy/hostnames`. The Drizzle layer is
 * mocked at the service boundary — we inject a stub service via
 * `buildCustomHostnameRoutes` and exercise the routes end-to-end.
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import type { TenantCustomHostname } from "@repo/db/schema";
import type { Tenant } from "@repo/tenancy";
import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeAuthSession,
  makeAuthUser,
} from "@/__tests__/fixtures/auth-session";
import { createEmptyRequestContext, type Env } from "@/lib/context";
import { handleError } from "@/lib/errors";
import type { AuthSession } from "@/modules/auth/instance";
import { buildPrincipal } from "@/modules/auth/principal";
import { CustomHostnameError } from "../custom-hostname-errors";
import { buildCustomHostnameRoutes } from "../routes";

function row(
  overrides: Partial<TenantCustomHostname> = {}
): TenantCustomHostname {
  const now = new Date("2026-05-12T00:00:00.000Z");
  return {
    id: "tnh_test_1",
    organizationId: "org_acme",
    hostname: "tenant.example.com",
    lifecycleStatus: "pending_txt",
    caddyCertStorageKey: null,
    verificationToken: "vtok_test",
    verificationVerifiedAt: null,
    verificationErrors: [],
    lastReconciledAt: null,
    lastHandshakeAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    organizationId: "org_acme",
    slug: "acme",
    host: "acme.app.localhost",
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 0,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
    ...overrides,
  };
}

type RouteService = Parameters<typeof buildCustomHostnameRoutes>[0]["service"];

function stubService(overrides: Partial<RouteService> = {}): RouteService {
  return {
    request: vi.fn(async () => ({ row: row() })),
    list: vi.fn(async () => [row()]),
    verifyTxt: vi.fn(async () => row({ lifecycleStatus: "awaiting_caddy" })),
    remove: vi.fn(async () => row({ lifecycleStatus: "removing" })),
    ...overrides,
  };
}

type AppCtx = {
  tenant: Tenant | null;
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

function makeApp(ctx: AppCtx, service: RouteService = stubService()) {
  const app = new OpenAPIHono<Env>();
  app.use("*", async (c: Context<Env>, next: Next) => {
    const principal = buildPrincipal(
      ctx.user && ctx.session
        ? ({ user: ctx.user, session: ctx.session } as AuthSession)
        : null
    );
    c.set("requestContext", {
      ...createEmptyRequestContext(),
      tenant: ctx.tenant,
      principal,
    });
    await next();
  });
  app.onError((err, c) => handleError(err, c));
  const router = buildCustomHostnameRoutes({
    service,
    cnameTarget: "app.localhost",
    txtLabel: "_app-verify",
    appWildcardHost: "app.localhost",
  });
  app.route("/api/tenancy/hostnames", router);
  return app;
}

const authedUser = makeAuthUser({ id: "u_1" });
const authedSession = makeAuthSession({
  id: "s_1",
  activeOrganizationId: "org_acme",
});

describe("POST /api/tenancy/hostnames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the service row + cname target + txt label on success", async () => {
    const service = stubService();
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "tenant.example.com" }),
      }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      hostname: { id: string };
      cnameTarget: string;
      txtLabel: string;
    };
    expect(body.hostname.id).toBe("tnh_test_1");
    expect(body.cnameTarget).toBe("app.localhost");
    expect(body.txtLabel).toBe("_app-verify");
    expect(service.request).toHaveBeenCalledWith({
      orgId: "org_acme",
      hostname: "tenant.example.com",
      appWildcardHost: "app.localhost",
    });
  });

  it("returns 400 INVALID_HOSTNAME when the service rejects with invalid_hostname", async () => {
    const service = stubService({
      request: vi.fn(async () => {
        throw new CustomHostnameError("invalid_hostname");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "evil.app.localhost" }),
      }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_HOSTNAME");
  });

  it("returns 429 with MAX_PENDING code when the service rejects with max_pending", async () => {
    const service = stubService({
      request: vi.fn(async () => {
        throw new CustomHostnameError("max_pending");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "tenant.example.com" }),
      }
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MAX_PENDING");
  });

  it("returns 429 with RATE_LIMIT_24H when the 24h guard trips", async () => {
    const service = stubService({
      request: vi.fn(async () => {
        throw new CustomHostnameError("rate_limit_24h");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "tenant.example.com" }),
      }
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMIT_24H");
  });

  it("returns 409 with DUPLICATE_HOSTNAME on unique violation", async () => {
    const service = stubService({
      request: vi.fn(async () => {
        throw new CustomHostnameError("duplicate_hostname");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: "tenant.example.com" }),
      }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DUPLICATE_HOSTNAME");
  });

  it("returns 409 with INVALID_TRANSITION when the lifecycle rejects an arrow", async () => {
    const service = stubService({
      verifyTxt: vi.fn(async () => {
        throw new CustomHostnameError("invalid_transition");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames/tnh_test_1/verify-txt",
      { method: "POST" }
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TRANSITION");
  });
});

describe("GET /api/tenancy/hostnames", () => {
  it("returns the service-list rows scoped to the active org", async () => {
    const service = stubService({
      list: vi.fn(async (orgId: string) => {
        if (orgId !== "org_acme") {
          throw new Error("test guard: org mismatch");
        }
        return [row({ id: "tnh_a" }), row({ id: "tnh_b" })];
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames"
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hostnames: { id: string }[];
    };
    expect(body.hostnames.map((h) => h.id)).toEqual(["tnh_a", "tnh_b"]);
  });
});

describe("POST /api/tenancy/hostnames/:id/verify-txt", () => {
  it("returns 200 with the awaiting_caddy row on success", async () => {
    const service = stubService();
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames/tnh_test_1/verify-txt",
      { method: "POST" }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hostname: { lifecycleStatus: string };
    };
    expect(body.hostname.lifecycleStatus).toBe("awaiting_caddy");
    expect(service.verifyTxt).toHaveBeenCalledWith({
      id: "tnh_test_1",
      orgId: "org_acme",
    });
  });

  it("returns 400 with VERIFY_MISMATCH when TXT does not match", async () => {
    const service = stubService({
      verifyTxt: vi.fn(async () => {
        throw new CustomHostnameError("verify_mismatch");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames/tnh_test_1/verify-txt",
      { method: "POST" }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VERIFY_MISMATCH");
  });
});

describe("DELETE /api/tenancy/hostnames/:id", () => {
  it("returns 200 with the removing row on success", async () => {
    const service = stubService();
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames/tnh_test_1",
      { method: "DELETE" }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hostname: { lifecycleStatus: string };
    };
    expect(body.hostname.lifecycleStatus).toBe("removing");
  });

  it("returns 404 when the service throws not_found for the id/org pair", async () => {
    const service = stubService({
      remove: vi.fn(async () => {
        throw new CustomHostnameError("not_found");
      }),
    });
    const app = makeApp(
      { tenant: tenant(), user: authedUser, session: authedSession },
      service
    );
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames/tnh_missing",
      { method: "DELETE" }
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("authn / authz / tenancy guards", () => {
  it("returns 404 when c.var.tenant is null", async () => {
    const app = makeApp({
      tenant: null,
      user: authedUser,
      session: authedSession,
    });
    const res = await app.request(
      "http://nope.app.localhost/api/tenancy/hostnames"
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when no user is on c.var", async () => {
    const app = makeApp({
      tenant: tenant(),
      user: null,
      session: authedSession,
    });
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames"
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when activeOrganizationId does not match the tenant", async () => {
    const session = makeAuthSession({
      id: "s_1",
      activeOrganizationId: "org_other",
    });
    const app = makeApp({ tenant: tenant(), user: authedUser, session });
    const res = await app.request(
      "http://acme.app.localhost/api/tenancy/hostnames"
    );
    expect(res.status).toBe(403);
  });
});
